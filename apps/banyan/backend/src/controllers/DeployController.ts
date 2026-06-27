import { Context } from 'koa'
import crypto from 'crypto'
import { Deployment } from '../models/index.js'
import { Application } from '../models/index.js'
import { EcsInstance } from '../models/index.js'
import { agentGateway } from '../services/AgentGateway.js'
import { logger } from '../utils/logger.js'
import type { DeployRequest, CollectionDef, CloudFunctionDef } from '../services/AgentGateway.js'
import uiDefinitionService from '../services/UIDefinitionService.js'
import { SchemaService } from '../services/SchemaService.js'
import cloudFunctionService from '../services/CloudFunctionService.js'
import dialogueService from '../services/DialogueService.js'

// ─── 辅助 ─────────────────────────────────────────────────────────────────────

function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

function toSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[\u4e00-\u9fa5]+/g, (match) =>
        match
          .split('')
          .map((_, i) => i.toString(36))
          .join(''),
      )
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32) || 'app'
  )
}

// ─── DeployController ─────────────────────────────────────────────────────────

export class DeployController {
  /**
   * POST /api/deploy/publish
   * 发布应用到 Web
   * Body: { applicationId, deployType? }
   */
  async publish(ctx: Context): Promise<void> {
    const user = ctx.state.user
    if (!user) {
      ctx.status = 401
      ctx.body = { success: false, message: '未认证' }
      return
    }
    const { teamId, userId } = user
    if (!teamId) {
      ctx.status = 403
      ctx.body = { success: false, message: '请先创建或加入一个团队' }
      return
    }
    const { applicationId, deployType = 'static' } = ctx.request.body as {
      applicationId: string
      deployType?: 'static' | 'fullstack'
    }

    // 1. 查找应用
    const app = await Application.findOne({ application_id: applicationId, teamId })
    if (!app) {
      ctx.status = 404
      ctx.body = { success: false, message: '应用不存在' }
      return
    }

    // 2. 查找团队绑定的 ECS 实例，确认已就绪
    const ecsInstance = await EcsInstance.findOne({ teamId })
    if (!ecsInstance || ecsInstance.status !== 'ready') {
      ctx.status = 400
      ctx.body = { success: false, message: '团队环境尚未就绪，请等待开通完成' }
      return
    }

    // 3. 检查 agent 是否在线
    if (!agentGateway.isAgentOnline(teamId)) {
      ctx.status = 503
      ctx.body = { success: false, message: '部署代理离线，请稍后重试' }
      return
    }

    // 4. 生成或复用 appSlug
    if (!app.appSlug) {
      app.appSlug = toSlug(app.name) + '-' + applicationId.slice(-6)
      await app.save()
    }

    // 5. 查询数据模型（版本号引用模型：部署最新已验收版本，以最新 done Dialogue 持有的三个版本号为准）
    let collections: CollectionDef[] | undefined
    let cloudFunctions: CloudFunctionDef[] | undefined

    const versions = await dialogueService.getLatestAcceptedVersions(applicationId)
    const [schemaResult, cfGroup, contentResult] = await Promise.all([
      SchemaService.getByVersion(applicationId, versions.schemaVersion),
      cloudFunctionService.getByVersion(applicationId, versions.cloudFunctionVersion),
      uiDefinitionService.getByVersion(applicationId, versions.uiDefinitionVersion),
    ])
    const cfList = cfGroup?.functions ?? []
    const uiJSON = contentResult?.uiJSON ?? ''

    if ((schemaResult?.collections.length ?? 0) > 0) {
      collections = schemaResult!.collections.map((c) => ({
        name: c.name,
        displayName: c.displayName,
        fields: c.fields.map((f) => ({
          name: f.name,
          displayName: f.displayName,
          type: f.type,
          required: f.required,
          defaultValue: f.defaultValue,
          refCollection: f.refCollection,
          enumValues: f.enumValues,
        })),
      }))
    }

    if (cfList.length > 0) {
      cloudFunctions = cfList.map((cf) => ({
        functionId: cf.functionId,
        name: cf.name,
        displayName: cf.displayName,
        description: cf.description,
        flowSchema: cf.flowSchema,
      }))
    }

    // 6. 自动判断 deployType：有数据表或云函数则升级为 fullstack
    const effectiveDeployType = collections || cloudFunctions ? 'fullstack' : deployType

    // 7. 创建部署记录（使用 effectiveDeployType 确保记录与实际行为一致）
    //    同时冻结发布快照 —— 回滚时从此处取出完整数据重发给 agent
    const deploymentId = generateId('deploy')
    await Deployment.create({
      deploymentId,
      applicationId,
      teamId,
      version: app.version,
      deployType: effectiveDeployType,
      status: 'pending',
      triggeredBy: userId,
      snapshot: {
        uiJSON,
        collections:
          collections?.map((c) => ({
            name: c.name,
            displayName: c.displayName,
            fields: c.fields.map((f) => ({
              name: f.name,
              displayName: f.displayName,
              type: f.type,
              required: f.required,
              defaultValue: f.defaultValue,
              refCollection: f.refCollection,
              enumValues: f.enumValues,
            })),
          })) ?? [],
        cloudFunctions:
          cloudFunctions?.map((cf) => ({
            functionId: cf.functionId,
            name: cf.name,
            displayName: cf.displayName,
            flowSchema: cf.flowSchema,
          })) ?? [],
      },
    })

    // 8. 构建部署请求（ADR-042：使用版本化内容表的 uiJSON）
    const deployRequest: DeployRequest = {
      requestId: deploymentId,
      appId: applicationId,
      appSlug: app.appSlug!,
      uiJSON,
      teamDomain: ecsInstance.domain!,
      width: 375, // 默认移动端宽度，后续可从 uiJSON 中提取
      height: 812,
      canvasVersion: '0.1.0', // TODO: 从 package.json 或环境变量读取
      deployType: effectiveDeployType,
      collections,
      cloudFunctions,
    }

    // 7. 异步发送部署指令（不阻塞响应）
    this._executeDeploy(teamId, deployRequest, applicationId, deploymentId).catch((err) => {
      logger.error(`[Deploy ${deploymentId}] unexpected error:`, err)
    })

    ctx.status = 201
    ctx.body = {
      success: true,
      data: {
        deploymentId,
        status: 'pending',
        message: '部署任务已创建',
      },
    }
  }

  /**
   * POST /api/deploy/rollback
   * 回滚到历史发布版本
   * Body: { deploymentId } — 要回滚到的目标 Deployment 记录
   *
   * 流程：从目标 Deployment 的 snapshot 中取出完整数据，构建新的 DeployRequest 发给 agent。
   * 本质上就是「用历史快照重新做一次 publish」。
   */
  async rollback(ctx: Context): Promise<void> {
    const user = ctx.state.user
    if (!user) {
      ctx.status = 401
      ctx.body = { success: false, message: '未认证' }
      return
    }
    const { teamId, userId } = user
    if (!teamId) {
      ctx.status = 403
      ctx.body = { success: false, message: '请先创建或加入一个团队' }
      return
    }
    const { deploymentId: targetDeploymentId } = ctx.request.body as { deploymentId: string }

    // 1. 查找目标部署记录
    const targetDeployment = await Deployment.findOne({ deploymentId: targetDeploymentId, teamId }).lean()
    if (!targetDeployment) {
      ctx.status = 404
      ctx.body = { success: false, message: '部署记录不存在' }
      return
    }

    if (!targetDeployment.snapshot) {
      ctx.status = 400
      ctx.body = { success: false, message: '该部署记录没有数据快照，无法回滚（可能是早期版本的部署）' }
      return
    }

    if (targetDeployment.status !== 'success') {
      ctx.status = 400
      ctx.body = { success: false, message: '只能回滚到部署成功的版本' }
      return
    }

    // 2. 查找应用和团队
    const app = await Application.findOne({ application_id: targetDeployment.applicationId, teamId })
    if (!app) {
      ctx.status = 404
      ctx.body = { success: false, message: '应用不存在' }
      return
    }

    const ecsInstance = await EcsInstance.findOne({ teamId })
    if (!ecsInstance || ecsInstance.status !== 'ready') {
      ctx.status = 400
      ctx.body = { success: false, message: '团队环境尚未就绪' }
      return
    }

    if (!agentGateway.isAgentOnline(teamId)) {
      ctx.status = 503
      ctx.body = { success: false, message: '部署代理离线，请稍后重试' }
      return
    }

    // 3. 从快照中提取数据
    const { uiJSON, collections, cloudFunctions } = targetDeployment.snapshot
    const parsedCollections = collections.length > 0 ? collections : undefined
    const parsedCloudFunctions = cloudFunctions.length > 0 ? cloudFunctions : undefined
    const effectiveDeployType = parsedCollections || parsedCloudFunctions ? 'fullstack' : ('static' as const)

    // 4. 创建新的部署记录（类型标记为回滚）
    const rollbackDeploymentId = generateId('deploy')
    await Deployment.create({
      deploymentId: rollbackDeploymentId,
      applicationId: targetDeployment.applicationId,
      teamId,
      version: targetDeployment.version,
      deployType: effectiveDeployType,
      status: 'pending',
      triggeredBy: userId,
      snapshot: targetDeployment.snapshot, // 回滚记录也保存快照，形成完整链条
    })

    // 5. 构建部署请求（使用历史快照数据）
    const deployRequest: DeployRequest = {
      requestId: rollbackDeploymentId,
      appId: targetDeployment.applicationId,
      appSlug: app.appSlug!,
      uiJSON,
      teamDomain: ecsInstance.domain!,
      width: 375,
      height: 812,
      canvasVersion: '0.1.0',
      deployType: effectiveDeployType,
      collections: parsedCollections as DeployRequest['collections'],
      cloudFunctions: parsedCloudFunctions as DeployRequest['cloudFunctions'],
    }

    // 6. 异步执行部署
    this._executeDeploy(teamId, deployRequest, targetDeployment.applicationId, rollbackDeploymentId).catch(
      (err) => {
        logger.error(`[Rollback ${rollbackDeploymentId}] unexpected error:`, err)
      },
    )

    ctx.status = 201
    ctx.body = {
      success: true,
      data: {
        deploymentId: rollbackDeploymentId,
        rollbackTo: targetDeploymentId,
        rollbackToVersion: targetDeployment.version,
        status: 'pending',
        message: '回滚任务已创建',
      },
    }
  }

  /**
   * GET /api/deploy/status/:deploymentId
   * 查询部署状态
   */
  async getStatus(ctx: Context): Promise<void> {
    const user = ctx.state.user
    if (!user) {
      ctx.status = 401
      ctx.body = { success: false, message: '未认证' }
      return
    }
    const { deploymentId } = ctx.params
    const { teamId } = user
    if (!teamId) {
      ctx.status = 403
      ctx.body = { success: false, message: '请先创建或加入一个团队' }
      return
    }

    const deployment = await Deployment.findOne({ deploymentId, teamId }).lean()
    if (!deployment) {
      ctx.status = 404
      ctx.body = { success: false, message: '部署记录不存在' }
      return
    }

    ctx.body = { success: true, data: deployment }
  }

  /**
   * GET /api/deploy/history/:applicationId
   * 查询应用的部署历史
   */
  async getHistory(ctx: Context): Promise<void> {
    const user = ctx.state.user
    if (!user) {
      ctx.status = 401
      ctx.body = { success: false, message: '未认证' }
      return
    }
    const { applicationId } = ctx.params
    const { teamId } = user
    if (!teamId) {
      ctx.status = 403
      ctx.body = { success: false, message: '请先创建或加入一个团队' }
      return
    }
    const limit = Math.min(parseInt(ctx.query.limit as string) || 20, 50)

    const deployments = await Deployment.find({ applicationId, teamId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()

    ctx.body = { success: true, data: deployments }
  }

  /**
   * GET /api/deploy/agent-status
   * 查询当前团队 agent 在线状态
   */
  async getAgentStatus(ctx: Context): Promise<void> {
    const user = ctx.state.user
    if (!user) {
      ctx.status = 401
      ctx.body = { success: false, message: '未认证' }
      return
    }
    const { teamId } = user
    if (!teamId) {
      ctx.status = 403
      ctx.body = { success: false, message: '请先创建或加入一个团队' }
      return
    }
    const ecsInstance = await EcsInstance.findOne({ teamId }).lean()

    ctx.body = {
      success: true,
      data: {
        online: agentGateway.isAgentOnline(teamId),
        provisionStatus: ecsInstance?.status ?? 'none',
        domain: ecsInstance?.domain,
      },
    }
  }

  // ─── 私有方法 ───────────────────────────────────────────────────────────────

  private async _executeDeploy(
    teamId: string,
    request: DeployRequest,
    applicationId: string,
    deploymentId: string,
  ): Promise<void> {
    try {
      // 更新状态为 building
      await Deployment.updateOne({ deploymentId }, { $set: { status: 'building', startedAt: new Date() } })

      // 发送部署指令，监听进度
      const result = await agentGateway.deploy(teamId, request, async (progress) => {
        await Deployment.updateOne(
          { deploymentId },
          { $set: { currentStep: progress.message, progress: progress.progress } },
        ).catch(() => {})
      })

      if (result.success) {
        // 部署成功：更新部署记录
        await Deployment.updateOne(
          { deploymentId },
          { $set: { status: 'success', url: result.url, progress: 100, finishedAt: new Date() } },
        )
      } else {
        // 部署失败
        await Deployment.updateOne(
          { deploymentId },
          { $set: { status: 'failed', error: result.error, finishedAt: new Date() } },
        )
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      await Deployment.updateOne(
        { deploymentId },
        { $set: { status: 'failed', error: message, finishedAt: new Date() } },
      ).catch(() => {})
    }
  }
}

export const deployController = new DeployController()
