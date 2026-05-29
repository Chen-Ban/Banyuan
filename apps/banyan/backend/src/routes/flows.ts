/**
 * /api/apps/:appId/flows — FlowSchema 后端执行路由
 *
 * 新增于 ADR-013：使用 banvas-flow/server 执行后端 FlowSchema，
 * 替代旧的纯代码云函数的新路径。
 *
 * 路由：
 *   POST /api/apps/:appId/flows/run  → 执行 FlowSchema
 */

import Router from '@koa/router'
import type { Context } from 'koa'
import { FlowRunnerService } from '../services/FlowRunnerService.js'
import { appOwnership } from '../middleware/appOwnership.js'

const router = new Router({ prefix: '/api/apps/:appId/flows' })

// 所有 Flow 路由需要校验 appId 归属
router.use(appOwnership)

/**
 * POST /api/apps/:appId/flows/run
 *
 * Body: { schema: FlowSchema, input?: Record<string, unknown> }
 * Response: { success, data: { result }, duration }
 */
router.post('/run', async (ctx: Context) => {
  const { appId } = ctx.params as { appId: string }
  const body = ctx.request.body as { schema?: unknown; input?: Record<string, unknown> }

  if (!body.schema || typeof body.schema !== 'object') {
    ctx.status = 400
    ctx.body = { success: false, message: 'schema is required and must be an object' }
    return
  }

  const schema = body.schema as { nodes: unknown[]; edges: unknown[] }
  if (!Array.isArray(schema.nodes) || !Array.isArray(schema.edges)) {
    ctx.status = 400
    ctx.body = { success: false, message: 'schema must contain nodes[] and edges[]' }
    return
  }

  const result = await FlowRunnerService.run(appId, schema as any, body.input ?? {})

  if (!result.success) {
    ctx.status = 500
    ctx.body = { success: false, message: result.error, duration: result.duration }
    return
  }

  ctx.body = { success: true, data: { result: result.result }, duration: result.duration }
})

export default router
