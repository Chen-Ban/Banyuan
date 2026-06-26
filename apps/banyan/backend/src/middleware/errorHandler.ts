/**
 * 全局错误处理中间件
 *
 * 统一捕获所有异常，输出结构化 ErrorPayload：
 * - BanyanError：返回对应 httpStatus + 结构化 error 字段
 * - 其他 Error：包装为 INTERNAL_ERROR，生产环境隐藏细节
 */

import type { Context, Next } from 'koa'
import { BanyanError } from '../errors/BanyanError.js'
import { toBanyanErrorPayload } from '../errors/sse.js'

export function errorHandler() {
  return async (ctx: Context, next: Next) => {
    try {
      await next()
    } catch (err: unknown) {
      // Sentry 异常上报（可选，SENTRY_DSN 未设置时 captureException 是 no-op）
      if (err instanceof Error) {
        try {
          const Sentry = await import('@sentry/node')
          Sentry.captureException(err, {
            extra: {
              requestId: (ctx.state as Record<string, unknown>).requestId,
              traceId: (ctx.state as Record<string, unknown>).traceId,
              url: ctx.url,
              method: ctx.method,
            },
          })
        } catch {
          /* Sentry 不可用，静默跳过 */
        }
      }

      if (err instanceof BanyanError) {
        ctx.status = err.httpStatus
        ctx.body = {
          success: false,
          error: err.toJSON(),
        }
      } else {
        const status =
          (err as { statusCode?: number; status?: number }).statusCode ??
          (err as { statusCode?: number; status?: number }).status ??
          500
        ctx.status = status
        ctx.body = {
          success: false,
          error: toBanyanErrorPayload(err),
        }
      }
      ctx.app.emit('error', err, ctx)
    }
  }
}
