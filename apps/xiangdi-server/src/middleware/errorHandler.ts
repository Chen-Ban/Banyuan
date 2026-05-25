import type { Context, Next } from 'koa'

export async function errorHandler(ctx: Context, next: Next) {
    try {
        await next()
    } catch (err: unknown) {
        const status =
            (err as { status?: number }).status ??
            (err as { statusCode?: number }).statusCode ??
            500
        const message =
            err instanceof Error ? err.message : 'Internal Server Error'
        ctx.status = status
        ctx.body = {
            success: false,
            error: message,
        }
        ctx.app.emit('error', err, ctx)
    }
}
