import type { Context, Next } from 'koa'

export async function errorHandler(ctx: Context, next: Next) {
  try {
    await next()
  } catch (err: unknown) {
    const error = err as { status?: number; statusCode?: number; message?: string }
    const status = error.status || error.statusCode || 500
    ctx.status = status
    ctx.body = {
      success: false,
      error: error.message || 'Internal Server Error',
    }
    ctx.app.emit('error', err, ctx)
  }
}
