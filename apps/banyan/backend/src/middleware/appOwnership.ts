/**
 * appOwnership 中间件 — 校验 :appId 参数对应的应用属于当前租户
 *
 * 适用于所有 /api/apps/:appId/* 和 /api/applications/:appId/* 路径。
 * 前置条件：authMiddleware 已执行（ctx.state.user 已注入）。
 *
 * 校验逻辑：
 *   1. 从 ctx.params 中提取 appId（兼容 :appId 和 :id）
 *   2. 查询 Application 文档
 *   3. 比对 application.tenantId 与 ctx.state.user.tenantId
 *   4. 不匹配则返回 403
 */

import { Context, Next } from 'koa'
import { Application } from '../models/index.js'

export async function appOwnership(ctx: Context, next: Next): Promise<void> {
  const appId = ctx.params.appId || ctx.params.id
  if (!appId) {
    await next()
    return
  }

  const user = ctx.state.user
  if (!user) {
    ctx.status = 401
    ctx.body = { success: false, message: '未认证' }
    return
  }

  const application = await Application.findOne({ application_id: appId })
    .select('tenantId')
    .lean()

  if (!application) {
    ctx.status = 404
    ctx.body = { success: false, message: '应用不存在' }
    return
  }

  if (application.tenantId !== user.tenantId) {
    ctx.status = 403
    ctx.body = { success: false, message: '无权访问该应用' }
    return
  }

  await next()
}
