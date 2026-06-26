/**
 * RBAC 权限校验中间件
 *
 * 用法：
 *   router.post('/deploy/publish', requirePermission('deploy:publish'), handler)
 *
 * 原理：从 JWT 解析 tenantId → 查 Tenant.planId → 查 Plan.permissions
 * 如果 JWT 不携带 tenantId（用户未选择租户上下文），返回 403。
 *
 * 缓存策略：每次请求查库（Plan 表极少变更，后续可加内存缓存）。
 */

import type { Middleware } from 'koa'
import { Tenant } from '../models/Tenant.js'
import { Plan } from '../models/Plan.js'

const PERMISSION_CACHE_TTL = 60_000 // 1 分钟
const permissionCache = new Map<string, { permissions: string[]; expiresAt: number }>()

async function getPlanPermissions(tenantId: string): Promise<string[]> {
  const cached = permissionCache.get(tenantId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.permissions
  }

  const tenant = await Tenant.findOne({ tenantId }).lean()
  if (!tenant) return []

  // 无 planId 时，按 plan 字段的旧逻辑处理：pro = 所有权限，free = 基础权限
  if (!tenant.planId) {
    const basePermissions = ['app:create', 'app:edit', 'ai:chat', 'data:browse', 'material:use']
    const proPermissions = [...basePermissions, 'deploy:publish', 'schema:manage', 'material:use']
    const perms = tenant.plan === 'pro' ? proPermissions : basePermissions
    permissionCache.set(tenantId, { permissions: perms, expiresAt: Date.now() + PERMISSION_CACHE_TTL })
    return perms
  }

  const plan = await Plan.findOne({ planId: tenant.planId, active: true }).lean()
  const permissions = plan?.permissions ?? []
  permissionCache.set(tenantId, { permissions, expiresAt: Date.now() + PERMISSION_CACHE_TTL })
  return permissions
}

/**
 * 创建权限校验中间件
 * @param permission 所需权限名称
 */
export function requirePermission(permission: string): Middleware {
  return async (ctx, next) => {
    const user = ctx.state.user
    if (!user) {
      ctx.status = 401
      ctx.body = { success: false, message: '未认证' }
      return
    }

    if (!user.tenantId) {
      ctx.status = 403
      ctx.body = {
        success: false,
        message: '请先创建或加入一个团队',
        code: 'NO_TENANT_CONTEXT',
      }
      return
    }

    const perms = await getPlanPermissions(user.tenantId)
    if (!perms.includes(permission)) {
      ctx.status = 403
      ctx.body = {
        success: false,
        message: '当前套餐不支持此操作，请升级套餐',
        code: 'PERMISSION_DENIED',
        requiredPermission: permission,
      }
      return
    }

    await next()
  }
}

/**
 * requireTenant — 强制要求 JWT 携带 tenantId
 * 用于所有需要租户上下文的接口。
 * 必须在 authMiddleware 之后使用。
 */
export function requireTenant(): Middleware {
  return async (ctx, next) => {
    const user = ctx.state.user
    if (!user) {
      ctx.status = 401
      ctx.body = { success: false, message: '未认证' }
      return
    }

    if (!user.tenantId) {
      ctx.status = 403
      ctx.body = {
        success: false,
        message: '请先创建或加入一个团队',
        code: 'NO_TENANT_CONTEXT',
      }
      return
    }

    await next()
  }
}

/**
 * clearPermissionCache — 清除指定租户的权限缓存
 *
 * 在套餐变更（升级/降级/支付激活）后调用，
 * 确保下次请求时重新从数据库加载最新权限。
 */
export function clearPermissionCache(tenantId: string): void {
  permissionCache.delete(tenantId)
}
