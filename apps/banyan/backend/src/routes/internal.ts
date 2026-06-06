/**
 * 内部 API 路由 — 供 XiangDi 服务按需回调读取应用状态
 *
 * 路径前缀：/internal/apps/:appId
 *
 * 安全说明：
 *   这些接口仅供内网服务间调用（XiangDi → Banyan），
 *   通过 INTERNAL_TOKEN 头做简单鉴权。
 *   生产环境必须配置 INTERNAL_API_TOKEN 环境变量。
 */
import Router from '@koa/router'
import appContentService from '../services/AppContentService.js'
import { SchemaService } from '../services/SchemaService.js'
import cloudFunctionService from '../services/CloudFunctionService.js'
import dialogueService from '../services/DialogueService.js'

const router = new Router({ prefix: '/internal/apps' })

// ─── 鉴权中间件 ──────────────────────────────────────────────────────────────

const INTERNAL_TOKEN = process.env.INTERNAL_API_TOKEN || '__dev_internal_token__'

router.use(async (ctx, next) => {
  const token = ctx.get('X-Internal-Token')
  if (token !== INTERNAL_TOKEN) {
    ctx.status = 401
    ctx.body = { success: false, message: 'Unauthorized: invalid internal token' }
    return
  }
  await next()
})

// ─── GET /internal/apps/:appId/appJSON ───────────────────────────────────────
// 返回应用的 appJSON（版本号引用模型：读取当前工作版本——活跃对话的草稿版本，
// 无活跃对话则回退到最新已接受版本）

router.get('/:appId/appJSON', async (ctx) => {
  const { appId } = ctx.params
  const versions = await dialogueService.getWorkingVersions(appId)
  const content = await appContentService.getByVersion(appId, versions.appContentVersion)

  ctx.body = {
    success: true,
    data: { appJSON: content?.appJSON ?? '', version: versions.appContentVersion },
  }
})

// ─── GET /internal/apps/:appId/schema ────────────────────────────────────────
// 返回应用的 CollectionSchema（表和字段定义）——当前工作版本

router.get('/:appId/schema', async (ctx) => {
  const { appId } = ctx.params
  const versions = await dialogueService.getWorkingVersions(appId)
  const schema = await SchemaService.getByVersion(appId, versions.schemaVersion)

  ctx.body = {
    success: true,
    data: { collections: schema?.collections ?? [], version: versions.schemaVersion },
  }
})

// ─── GET /internal/apps/:appId/cloud-functions ───────────────────────────────
// 返回应用的所有云函数列表（含 flowSchema）——当前工作版本

router.get('/:appId/cloud-functions', async (ctx) => {
  const { appId } = ctx.params
  const versions = await dialogueService.getWorkingVersions(appId)
  const group = await cloudFunctionService.getByVersion(appId, versions.cloudFunctionVersion)
  const functions = group?.functions ?? []

  ctx.body = {
    success: true,
    data: {
      functions: functions.map((fn) => ({
        functionId: fn.functionId,
        name: fn.name,
        displayName: fn.displayName,
        description: fn.description,
        flowSchema: fn.flowSchema,
      })),
    },
  }
})

// ─── GET /internal/apps/:appId/cloud-functions/:functionId ───────────────────
// 返回单个云函数详情——当前工作版本

router.get('/:appId/cloud-functions/:functionId', async (ctx) => {
  const { appId, functionId } = ctx.params
  const versions = await dialogueService.getWorkingVersions(appId)
  const group = await cloudFunctionService.getByVersion(appId, versions.cloudFunctionVersion)
  const fn = group?.functions.find((f) => f.functionId === functionId)

  if (!fn) {
    ctx.status = 404
    ctx.body = { success: false, message: `CloudFunction "${functionId}" not found` }
    return
  }

  ctx.body = {
    success: true,
    data: {
      functionId: fn.functionId,
      name: fn.name,
      displayName: fn.displayName,
      description: fn.description,
      flowSchema: fn.flowSchema,
    },
  }
})

export default router
