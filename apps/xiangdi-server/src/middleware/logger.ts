/**
 * HTTP 请求日志中间件
 *
 * 功能：
 *   1. 为每个请求生成/提取 requestId（优先从 x-request-id header 获取）
 *   2. 将 requestId 附加到 ctx.state.requestId
 *   3. 使用结构化 logger 记录请求开始和结束
 */

import crypto from 'node:crypto'
import type { Context, Next } from 'koa'
import { createRequestLogger } from '../logger.js'
import { httpRequestDuration, httpRequestTotal } from '../metrics.js'

export async function logger(ctx: Context, next: Next) {
  // 生成或提取 requestId
  const requestId = ctx.get('x-request-id') || crypto.randomUUID()
  ctx.state.requestId = requestId

  // 设置响应头，方便调用方追踪
  ctx.set('X-Request-Id', requestId)

  const reqLogger = createRequestLogger({ requestId })
  ctx.state.logger = reqLogger

  const path = ctx.path
  const method = ctx.method

  reqLogger.info('Request started', {
    method,
    url: ctx.url,
    userAgent: ctx.get('user-agent') || undefined,
  })

  const start = Date.now()
  try {
    await next()
  } catch (err) {
    // 让错误继续传播给 errorHandler 中间件
    throw err
  } finally {
    const ms = Date.now() - start
    const statusCode = String(ctx.status)
    httpRequestDuration.observe({ method, path, status_code: statusCode }, ms)
    httpRequestTotal.inc({ method, path, status_code: statusCode })

    reqLogger.info('Request completed', {
      method,
      url: ctx.url,
      status: ctx.status,
      duration: ms,
    })
  }
}
