import { Context, Next } from 'koa'
import { authService, AuthPayload } from '../services/AuthService.js'
import { AuthTokenInvalidError, AuthTokenExpiredError, AuthForbiddenError } from '../errors/index.js'

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
    throw new AuthTokenInvalidError('未提供认证 token')
  }

  const token = authHeader.slice(7)
  try {
    ctx.state.user = authService.verifyAccessToken(token)
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('expired')) {
      throw new AuthTokenExpiredError()
    }
    throw new AuthTokenInvalidError('Token 验证失败')
  }

  await next()
}

/**
 * requireRole — 角色权限检查中间件工厂
 * 基于 JWT 中的 membershipRole 字段（从 Membership 模型获取）。
 * 用法：router.get('/admin', authMiddleware, requireRole('admin', 'owner'), handler)
 */
export function requireRole(...roles: NonNullable<AuthPayload['membershipRole']>[]): (ctx: Context, next: Next) => Promise<void> {
  return async (ctx: Context, next: Next): Promise<void> => {
    const user = ctx.state.user
    if (!user) {
      throw new AuthTokenInvalidError('未认证')
    }
    if (!user.membershipRole || !roles.includes(user.membershipRole)) {
      throw new AuthForbiddenError()
    }
    await next()
  }
}
