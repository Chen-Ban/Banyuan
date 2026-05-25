/**
 * Knowledge Server · 内部认证中间件
 *
 * 通过共享密钥（X-Internal-Token）验证请求来源，
 * 确保只有 banyan 后端和 xiangdi-server 可以调用知识服务。
 *
 * 配置方式：
 *   环境变量 KNOWLEDGE_INTERNAL_TOKEN 设置密钥
 *   调用方在 header 中注入相同的 token
 *
 * 若未配置 KNOWLEDGE_INTERNAL_TOKEN，则在开发模式下跳过认证（打印警告），
 * 生产模式下拒绝所有请求。
 */

import type { Context, Next } from 'koa'

const INTERNAL_TOKEN = process.env.KNOWLEDGE_INTERNAL_TOKEN
const IS_PRODUCTION = process.env.NODE_ENV === 'production'

if (!INTERNAL_TOKEN) {
  if (IS_PRODUCTION) {
    console.error(
      '[Knowledge Auth] FATAL: KNOWLEDGE_INTERNAL_TOKEN is not set in production mode. ' +
      'All requests will be rejected.'
    )
  } else {
    console.warn(
      '[Knowledge Auth] WARNING: KNOWLEDGE_INTERNAL_TOKEN is not set. ' +
      'Authentication is DISABLED in development mode. ' +
      'Set KNOWLEDGE_INTERNAL_TOKEN in production to secure this service.'
    )
  }
}

/**
 * 内部认证中间件
 *
 * 跳过 /health 路由（健康检查无需认证）
 */
export async function internalAuth(ctx: Context, next: Next): Promise<void> {
  // 健康检查路由无需认证
  if (ctx.path === '/health') {
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
