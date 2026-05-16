import { Context, Next } from 'koa'

/**
 * 本地请求校验中间件
 * 只允许来自本机（localhost/127.0.0.1）的请求
 */
export default async function localOnly(ctx: Context, next: Next) {
  let clientIp: string | undefined

  if (ctx.ip) {
    clientIp = ctx.ip
  } else if (ctx.request.ip) {
    clientIp = ctx.request.ip
  } else {
    const forwardedFor = ctx.headers['x-forwarded-for']
    if (forwardedFor) {
      clientIp = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor.split(',')[0].trim()
    } else {
      clientIp = ctx.request.socket.remoteAddress
    }
  }

  const localIps = ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost']

  const isLocal =
    (clientIp && localIps.includes(clientIp)) ||
    (clientIp && clientIp.startsWith('127.')) ||
    (clientIp && clientIp.startsWith('::1')) ||
    ctx.request.hostname === 'localhost' ||
    ctx.request.hostname === '127.0.0.1'

  if (!isLocal) {
    ctx.status = 403
    ctx.body = {
      success: false,
      message: 'Forbidden: Only local requests are allowed',
    }
    return
  }

  await next()
}
