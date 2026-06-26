/**
 * HTTP 请求日志中间件
 *
 * 替换 koa-logger，使用结构化日志输出。
 * 为每个请求生成 requestId 和 traceId，写入 ctx.state 供下游使用。
 */

import crypto from 'node:crypto'
import type { Context, Next } from 'koa'
import { createLogger } from '../utils/logger.js'

/**
 * Structured HTTP request logger middleware
 *
 * 为每个请求生成/提取 requestId 和 traceId，记录请求开始和结束。
 * traceId 用于跨服务（banyan → XiangDi → LangSmith）的全链路追踪。
 */
export async function httpLogger(ctx: Context, next: Next) {
  const requestId = ctx.get('x-request-id') || crypto.randomUUID()
  const traceId = ctx.get('x-trace-id') || crypto.randomUUID()
  ctx.state.requestId = requestId
  ctx.state.traceId = traceId
  ctx.set('X-Request-Id', requestId)
  ctx.set('X-Trace-Id', traceId)

  const reqLogger = createLogger({ requestId })
  ctx.state.logger = reqLogger

  const method = ctx.method

  reqLogger.info('Request started', {
    method,
    url: ctx.url,
    userAgent: ctx.get('user-agent') || undefined,
  })

  const start = Date.now()
  await next()
  const ms = Date.now() - start

  reqLogger.info('Request completed', {
    method,
    path: ctx.path,
    status: ctx.status,
    duration: ms,
  })
}
