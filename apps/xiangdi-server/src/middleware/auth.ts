/**
 * XiangDi 服务 · 内部认证中间件
 *
 * 通过共享密钥（X-Internal-Token）验证请求来源，
 * 确保只有 banyan 后端可以调用 XiangDi 服务。
 *
 * 配置方式：
 *   环境变量 XIANGDI_INTERNAL_TOKEN 设置密钥
 *   banyan 后端代理请求时在 header 中注入相同的 token
 *
 * 若未配置 XIANGDI_INTERNAL_TOKEN，则在开发模式下跳过认证（打印警告），
 * 生产模式下拒绝所有请求。
 */

import type { Context, Next } from 'koa'
import { logger } from '../logger.js'

const INTERNAL_TOKEN = process.env.XIANGDI_INTERNAL_TOKEN
const IS_PRODUCTION = process.env.NODE_ENV === 'production'

if (!INTERNAL_TOKEN) {
  if (IS_PRODUCTION) {
    logger.error(
      'FATAL: XIANGDI_INTERNAL_TOKEN is not set in production mode. All requests will be rejected.',
    )
  } else {
    logger.warn(
      'XIANGDI_INTERNAL_TOKEN is not set. Authentication is DISABLED in development mode. ' +
        'Set XIANGDI_INTERNAL_TOKEN in production to secure this service.',
    )
  }
}

/**
 * 内部认证中间件
 *
 * 跳过 /health 路由（健康检查无需认证）
 */
export async function internalAuth(ctx: Context, next: Next): Promise<void> {
  // 健康检查和 metrics 路由无需认证
  if (ctx.path === '/health' || ctx.path === '/livez' || ctx.path === '/readyz' || ctx.path === '/metrics') {
    await next()
    return
  }

  // 未配置 token
  if (!INTERNAL_TOKEN) {
    if (IS_PRODUCTION) {
      ctx.status = 503
      ctx.body = {
        success: false,
        error: 'Service unavailable: authentication not configured',
      }
      return
    }
    // 开发模式：跳过认证
    await next()
    return
  }

  // 验证 X-Internal-Token header
  const token = ctx.get('X-Internal-Token')
  if (!token || token !== INTERNAL_TOKEN) {
    ctx.status = 401
    ctx.body = {
      success: false,
      error: 'Unauthorized: invalid or missing X-Internal-Token',
    }
    return
  }

  await next()
}
