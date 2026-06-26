/**
 * tenants API — 租户 CRUD + 成员管理 + 套餐
 */

import { get, post, put, del } from './client'
import type { ApiResponse } from './client'

// ─── 类型 ─────────────────────────────────────────────────────────────────────

export interface TenantInfo {
  tenantId: string
  name: string
  plan: 'free' | 'pro'
  planId?: string
  subscriptionExpiresAt?: string
  createdAt?: string
  updatedAt?: string
}

export interface PlanInfo {
  planId: string
  name: string
  monthlyCredits: number
  priceInCents: number
  permissions: string[]
  active: boolean
}

export interface MemberInfo {
  membershipId: string
  userId: string
  tenantId: string
  role: 'owner' | 'admin' | 'member'
  status: 'active' | 'invited' | 'disabled'
  joinedAt: string
  invitedBy?: string
  /** 后端 populate 后可能返回的用户信息 */
  user?: {
    userId: string
    username: string
    email?: string
  }
}

export interface CreditUsage {
  used: number
  limit: number
  yearMonth: string
}

// ─── 租户 ─────────────────────────────────────────────────────────────────────

/** 获取当前用户的租户列表 */
export function listMyTenants(): Promise<ApiResponse<TenantInfo[]>> {
  return get<ApiResponse<TenantInfo[]>>('/auth/tenants')
}

/** 切换当前会话的租户上下文 */
export function switchTenant(tenantId: string): Promise<ApiResponse<{ accessToken: string; refreshToken: string }>> {
  return post<ApiResponse<{ accessToken: string; refreshToken: string }>>('/auth/switch-tenant', { tenantId })
}

/** 获取租户详情 */
export function getTenant(tenantId: string): Promise<ApiResponse<TenantInfo>> {
  return get<ApiResponse<TenantInfo>>(`/tenants/${tenantId}`)
}

/** 创建租户 */
export function createTenant(name: string): Promise<ApiResponse<TenantInfo>> {
  return post<ApiResponse<TenantInfo>>('/tenants', { name })
}

/** 更新租户 */
export function updateTenant(tenantId: string, data: { name?: string }): Promise<ApiResponse<TenantInfo>> {
  return put<ApiResponse<TenantInfo>>(`/tenants/${tenantId}`, data)
}

// ─── 成员 ─────────────────────────────────────────────────────────────────────

/** 获取租户成员列表 */
export function listMembers(tenantId: string): Promise<ApiResponse<MemberInfo[]>> {
  return get<ApiResponse<MemberInfo[]>>(`/tenants/${tenantId}/members`)
}

/** 邀请成员 */
export function inviteMember(tenantId: string, username: string): Promise<ApiResponse<MemberInfo>> {
  return post<ApiResponse<MemberInfo>>(`/tenants/${tenantId}/invite`, { username })
}

/** 更新成员角色 */
export function updateMemberRole(
  tenantId: string,
  targetUserId: string,
  role: 'admin' | 'member',
): Promise<ApiResponse<MemberInfo>> {
  return put<ApiResponse<MemberInfo>>(`/tenants/${tenantId}/members/${targetUserId}`, { role })
}

/** 移除成员 */
export function removeMember(tenantId: string, targetUserId: string): Promise<ApiResponse<null>> {
  return del<ApiResponse<null>>(`/tenants/${tenantId}/members/${targetUserId}`)
}

// ─── 套餐 ─────────────────────────────────────────────────────────────────────

/** 更新租户套餐 */
export function updatePlan(tenantId: string, planId: string): Promise<ApiResponse<TenantInfo>> {
  return put<ApiResponse<TenantInfo>>(`/tenants/${tenantId}/plan`, { planId })
}

/** 获取可用套餐列表 */
export function listPlans(): Promise<ApiResponse<PlanInfo[]>> {
  return get<ApiResponse<PlanInfo[]>>('/plans')
}

// ─── 用量 ─────────────────────────────────────────────────────────────────────

/** 获取当前租户当月 credit 用量 */
export function getMonthlyUsage(): Promise<ApiResponse<CreditUsage>> {
  return get<ApiResponse<CreditUsage>>('/credits/usage')
}
