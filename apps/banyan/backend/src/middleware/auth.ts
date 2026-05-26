import { Context, Next } from 'koa'
import { authService, AuthPayload } from '../services/AuthService.js'

// Extend Koa's state type
declare module 'koa' {
  interface DefaultState {
    user?: AuthPayload
  }
}

/**
 * authMiddleware — 强制要求有效 JWT
 * 从 Authorization: Bearer <token> 头中提取并验证 token
 * 验证通过后将 payload 注入 ctx.state.user
 */
export async function authMiddleware(ctx: Context, next: Next): Promise<void> {
  const authHeader = ctx.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    ctx.status = 401
    ctx.body = { success: false, message: '未提供认证 token' }
    return
  }

  const token = authHeader.slice(7)
  try {
    ctx.state.user = authService.verifyAccessToken(token)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Token 验证失败'
    ctx.status = 401
    ctx.body = { success: false, message }
    return
  }

  await next()
}

/**
 * requireRole — 角色权限检查中间件工厂
 * 用法：router.get('/admin', authMiddleware, requireRole('admin', 'owner'), handler)
 */
export function requireRole(...roles: AuthPayload['role'][]): (ctx: Context, next: Next) => Promise<void> {
  return async (ctx: Context, next: Next): Promise<void> => {
    const user = ctx.state.user
    if (!user) {
      ctx.status = 401
      ctx.body = { success: false, message: '未认证' }
      return
    }
    if (!roles.includes(user.role)) {
      ctx.status = 403
      ctx.body = { success: false, message: '权限不足' }
      return
    }
    await next()
  }
}
