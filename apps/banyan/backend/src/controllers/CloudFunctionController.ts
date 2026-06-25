import { Context } from 'koa'
import { Types } from 'mongoose'
import cloudFunctionService, { CloudFunctionService } from '../services/CloudFunctionService.js'
import dialogueService from '../services/DialogueService.js'
import conversationService from '../services/ConversationService.js'
import type { ICloudFunctionDef } from '../models/types/versioned-content.js'
import { validateIdentifier } from '../utils/nameValidation.js'

/**
 * CloudFunctionController — 云函数的直接编辑入口（方向 B）
 *
 * 版本号引用模型下，用户绕过 AI 的自主修改也包装成一个自动验收的 type='edit' 对话：
 *   1. dialogueService.runAutoConfirmedEdit 创建 edit 对话并给三表 append 草稿版本
 *   2. mutator 中读取云函数草稿版本 → 纯计算变换 → 按版本号原地写回
 *   3. 对话自动验收（start → committing → done），其持有的版本号成为最新已接受版本
 *
 * 读取走最新已接受版本，与 ApplicationService.getFullApplicationById 聚合口径一致。
 */

/**
 * 格式化云函数响应体（ADR-042：使用 ICloudFunctionDef）
 */
function formatCloudFunction(fn: ICloudFunctionDef) {
  return {
    functionId: fn.functionId,
    name: fn.name,
    displayName: fn.displayName,
    description: fn.description,
    schema: fn.flowSchema,
  }
}

class CloudFunctionController {
  /**
   * 通用直接编辑封装：读取云函数草稿 → 纯计算 → 原地写回，返回 mutator 结果。
   */
  private async runCloudFunctionEdit<T>(
    appId: string,
    summary: string,
    transform: (functions: ICloudFunctionDef[]) => { functions: ICloudFunctionDef[]; result: T },
  ): Promise<T> {
    const conv = await conversationService.getOrCreate(appId)
    return dialogueService.runAutoConfirmedEdit({
      appId,
      conversationId: conv._id as Types.ObjectId,
      summary,
      mutate: async (versions) => {
        const draft = await cloudFunctionService.getByVersion(appId, versions.cloudFunctionVersion)
        const current = draft?.functions ?? []
        const { functions, result } = transform(current)
        await cloudFunctionService.updateByVersion(appId, versions.cloudFunctionVersion, functions)
        return result
      },
    })
  }

  /**
   * GET /api/apps/:appId/cloud-functions
   */
  async list(ctx: Context) {
    const { appId } = ctx.params as { appId: string }
    const versions = await dialogueService.getLatestAcceptedVersions(appId)
    const group = await cloudFunctionService.getByVersion(appId, versions.cloudFunctionVersion)
    ctx.body = {
      success: true,
      data: (group?.functions ?? []).map(formatCloudFunction),
    }
  }

  /**
   * GET /api/apps/:appId/cloud-functions/:functionId
   */
  async getOne(ctx: Context) {
    const { appId, functionId } = ctx.params as { appId: string; functionId: string }
    const versions = await dialogueService.getLatestAcceptedVersions(appId)
    const group = await cloudFunctionService.getByVersion(appId, versions.cloudFunctionVersion)
    const fn = group?.functions.find((f) => f.functionId === functionId)
    if (!fn) {
      ctx.status = 404
      ctx.body = { success: false, message: '云函数不存在' }
      return
    }

    ctx.body = { success: true, data: formatCloudFunction(fn) }
  }

  /**
   * POST /api/apps/:appId/cloud-functions
   */
  async create(ctx: Context) {
    const { appId } = ctx.params as { appId: string }
    const body = ctx.request.body as {
      name?: string
      displayName?: string
      description?: string
      schema?: Record<string, unknown>
      flowSchema?: Record<string, unknown>
    }

    if (!body.name?.trim()) {
      ctx.status = 400
      ctx.body = { success: false, message: '函数名不能为空' }
      return
    }
    try {
      validateIdentifier(body.name, '函数名')
    } catch (e: any) {
      ctx.status = 400
      ctx.body = { success: false, message: e.message }
      return
    }

    const created = await this.runCloudFunctionEdit(
      appId,
      `新增云函数「${body.displayName?.trim() || body.name.trim()}」`,
      (functions) => {
        const { functions: next, created } = CloudFunctionService.computeCreate(functions, {
          name: body.name!,
          displayName: body.displayName,
          description: body.description,
          flowSchema: body.schema ?? body.flowSchema,
        })
        return { functions: next, result: created }
      },
    )

    ctx.status = 201
    ctx.body = { success: true, data: formatCloudFunction(created) }
  }

  /**
   * PUT /api/apps/:appId/cloud-functions/:functionId
   */
  async update(ctx: Context) {
    const { appId, functionId } = ctx.params as { appId: string; functionId: string }
    const body = ctx.request.body as {
      name?: string
      displayName?: string
      description?: string
      schema?: Record<string, unknown>
      flowSchema?: Record<string, unknown>
    }

    const updated = await this.runCloudFunctionEdit(appId, `更新云函数「${functionId}」`, (functions) => {
      const { functions: next, updated } = CloudFunctionService.computeUpdate(functions, functionId, {
        name: body.name,
        displayName: body.displayName,
        description: body.description,
        flowSchema: body.schema ?? body.flowSchema,
      })
      return { functions: next, result: updated }
    })

    ctx.body = { success: true, data: formatCloudFunction(updated) }
  }

  /**
   * DELETE /api/apps/:appId/cloud-functions/:functionId
   */
  async remove(ctx: Context) {
    const { appId, functionId } = ctx.params as { appId: string; functionId: string }

    await this.runCloudFunctionEdit(appId, `删除云函数「${functionId}」`, (functions) => ({
      functions: CloudFunctionService.computeDelete(functions, functionId),
      result: true as const,
    }))

    ctx.body = { success: true }
  }
}

export default new CloudFunctionController()
