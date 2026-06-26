import type { Context, Next } from 'koa'

export async function errorHandler(ctx: Context, next: Next) {
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

    const status = (err as { status?: number }).status ?? (err as { statusCode?: number }).statusCode ?? 500
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    ctx.status = status
    ctx.body = {
      success: false,
      error: message,
    }
    ctx.app.emit('error', err, ctx)
  }
}
