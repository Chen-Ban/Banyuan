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
import Application from '../models/Application.js'
import { SchemaService } from '../services/SchemaService.js'
import cloudFunctionService from '../services/CloudFunctionService.js'

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

// ─── GET /internal/apps/:appId/pages ─────────────────────────────────────────
// 返回应用的 pages（BanvasGL 序列化 JSON 字符串数组）

router.get('/:appId/pages', async (ctx) => {
  const { appId } = ctx.params
  const app = await Application.findOne({ application_id: appId }).select('pages')

  if (!app) {
    ctx.status = 404
    ctx.body = { success: false, message: `Application "${appId}" not found` }
    return
  }

  ctx.body = { success: true, data: { pages: app.pages ?? [] } }
})

// ─── GET /internal/apps/:appId/schema ────────────────────────────────────────
// 返回应用的 CollectionSchema（表和字段定义）

router.get('/:appId/schema', async (ctx) => {
  const { appId } = ctx.params
  const schema = await SchemaService.getSchema(appId)

  ctx.body = { success: true, data: { collections: schema.collections, version: schema.version } }
})

// ─── GET /internal/apps/:appId/cloud-functions ───────────────────────────────
// 返回应用的所有云函数列表（含 flowSchema）

router.get('/:appId/cloud-functions', async (ctx) => {
  const { appId } = ctx.params
  const functions = await cloudFunctionService.listByApp(appId)

  ctx.body = {
    success: true,
    data: {
      functions: functions.map((fn) => ({
        functionId: fn.functionId,
        name: fn.name,
        displayName: fn.displayName,
        description: fn.description,
        flowSchema: fn.flowSchema,
        version: fn.version,
      })),
    },
  }
})

// ─── GET /internal/apps/:appId/cloud-functions/:functionId ───────────────────
// 返回单个云函数详情

router.get('/:appId/cloud-functions/:functionId', async (ctx) => {
  const { appId, functionId } = ctx.params
  const fn = await cloudFunctionService.getByFunctionId(appId, functionId)

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
      version: fn.version,
    },
  }
})

export default router
