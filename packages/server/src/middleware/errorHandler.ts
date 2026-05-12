import type { Context, Next } from 'koa'

export async function errorHandler(ctx: Context, next: Next) {
    try {
        await next()
    } catch (err: any) {
        const status = err.status || err.statusCode || 500
        ctx.status = status
        ctx.body = {
            success: false,
            error: err.message || 'Internal Server Error',
        }
        ctx.app.emit('error', err, ctx)
    }
}
