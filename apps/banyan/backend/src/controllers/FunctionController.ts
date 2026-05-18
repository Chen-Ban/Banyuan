/**
 * FunctionController — 云函数 REST API 控制器
 *
 * 路由：
 *   GET    /api/apps/:appId/functions           → 列表
 *   GET    /api/apps/:appId/functions/:name      → 详情
 *   PUT    /api/apps/:appId/functions/:name      → 新增/更新
 *   DELETE /api/apps/:appId/functions/:name      → 删除
 *   POST   /api/apps/:appId/functions/:name/validate → 代码校验
 *   POST   /api/apps/:appId/functions/:name/run  → 执行云函数
 */

import type { Context } from 'koa'
import { FunctionService } from '../services/FunctionService.js'
import type { UpsertFunctionInput } from '../services/FunctionService.js'
import { FunctionRunner } from '../services/FunctionRunner.js'

export class FunctionController {
  // ── GET /api/apps/:appId/functions ──────────────────────────────────────────
  static async listFunctions(ctx: Context) {
    const { appId } = ctx.params as { appId: string }
    const functions = await FunctionService.listFunctions(appId)
    ctx.body = { success: true, data: functions }
  }

  // ── GET /api/apps/:appId/functions/:name ───────────────────────────────────
  static async getFunction(ctx: Context) {
    const { appId, name } = ctx.params as { appId: string; name: string }
    const fn = await FunctionService.getFunction(appId, name)
    if (!fn) {
      ctx.status = 404
      ctx.body = { success: false, message: `Function "${name}" not found` }
      return
    }
    ctx.body = { success: true, data: fn }
  }

  // ── PUT /api/apps/:appId/functions/:name ───────────────────────────────────
  static async upsertFunction(ctx: Context) {
    const { appId, name } = ctx.params as { appId: string; name: string }
    const body = ctx.request.body as UpsertFunctionInput

    if (!body.displayName || typeof body.displayName !== 'string') {
      ctx.status = 400
      ctx.body = { success: false, message: 'displayName is required' }
      return
    }
    if (body.code === undefined || typeof body.code !== 'string') {
      ctx.status = 400
      ctx.body = { success: false, message: 'code is required' }
      return
    }

    const result = await FunctionService.upsertFunction(appId, name, body)
    ctx.body = { success: true, data: result }
  }

  // ── DELETE /api/apps/:appId/functions/:name ─────────────────────────────────
  static async deleteFunction(ctx: Context) {
    const { appId, name } = ctx.params as { appId: string; name: string }
    await FunctionService.deleteFunction(appId, name)
    ctx.body = { success: true, message: `Function "${name}" deleted` }
  }

  // ── POST /api/apps/:appId/functions/:name/validate ─────────────────────────
  static async validateFunction(ctx: Context) {
    const body = ctx.request.body as { code?: string }

    if (!body.code || typeof body.code !== 'string') {
      ctx.status = 400
      ctx.body = { success: false, message: 'code is required' }
      return
    }

    const result = FunctionService.validateCode(body.code)
    ctx.body = { success: true, data: result }
  }

  // ── POST /api/apps/:appId/functions/:name/run ──────────────────────────────
  static async runFunction(ctx: Context) {
    const { appId, name } = ctx.params as { appId: string; name: string }
    const body = ctx.request.body as { input?: Record<string, unknown> }

    const fn = await FunctionService.getFunction(appId, name)
    if (!fn) {
      ctx.status = 404
      ctx.body = { success: false, message: `Function "${name}" not found` }
      return
    }

    const result = await FunctionRunner.run({
      appId,
      functionName: name,
      code: fn.code,
      input: body.input ?? {},
    })

    if (!result.success) {
      ctx.status = 500
      ctx.body = { success: false, message: result.error, duration: result.duration }
      return
    }

    ctx.body = { success: true, data: result.output, duration: result.duration }
  }
}
