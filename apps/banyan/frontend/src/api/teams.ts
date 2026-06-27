/**
 * teams API — 团队 CRUD + 成员管理 + 套餐
 */

import { get, post, put, del } from './client'
import type { ApiResponse } from './client'

// ─── 类型 ─────────────────────────────────────────────────────────────────────

export interface TeamInfo {
  teamId: string
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
  teamId: string
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
  total: number
  yearMonth: string
}

// ─── 团队 ─────────────────────────────────────────────────────────────────────

/** 获取当前用户的团队列表 */
export function listMyTeams(): Promise<ApiResponse<TeamInfo[]>> {
  return get<ApiResponse<TeamInfo[]>>('/auth/teams')
}

/** 切换当前会话的团队上下文 */
export function switchTeam(teamId: string): Promise<ApiResponse<{ accessToken: string; refreshToken: string }>> {
  return post<ApiResponse<{ accessToken: string; refreshToken: string }>>('/auth/switch-team', { teamId })
}

/** 获取团队详情 */
export function getTeam(teamId: string): Promise<ApiResponse<TeamInfo>> {
  return get<ApiResponse<TeamInfo>>(`/teams/${teamId}`)
}

/** 创建团队 */
export function createTeam(name: string): Promise<ApiResponse<TeamInfo>> {
  return post<ApiResponse<TeamInfo>>('/teams', { name })
}

/** 更新团队 */
export function updateTeam(teamId: string, data: { name?: string }): Promise<ApiResponse<TeamInfo>> {
  return put<ApiResponse<TeamInfo>>(`/teams/${teamId}`, data)
}

// ─── 成员 ─────────────────────────────────────────────────────────────────────

/** 获取团队成员列表 */
export function listMembers(teamId: string): Promise<ApiResponse<MemberInfo[]>> {
  return get<ApiResponse<MemberInfo[]>>(`/teams/${teamId}/members`)
}

/** 邀请成员 */
export function inviteMember(teamId: string, username: string): Promise<ApiResponse<MemberInfo>> {
  return post<ApiResponse<MemberInfo>>(`/teams/${teamId}/invite`, { username })
}

/** 更新成员角色 */
export function updateMemberRole(
  teamId: string,
  targetUserId: string,
  role: 'admin' | 'member',
): Promise<ApiResponse<MemberInfo>> {
  return put<ApiResponse<MemberInfo>>(`/teams/${teamId}/members/${targetUserId}`, { role })
}

/** 移除成员 */
export function removeMember(teamId: string, targetUserId: string): Promise<ApiResponse<null>> {
  return del<ApiResponse<null>>(`/teams/${teamId}/members/${targetUserId}`)
}

// ─── 套餐 ─────────────────────────────────────────────────────────────────────

/** 更新团队套餐 */
export function updatePlan(teamId: string, planId: string): Promise<ApiResponse<TeamInfo>> {
  return put<ApiResponse<TeamInfo>>(`/teams/${teamId}/plan`, { planId })
}

/** 获取可用套餐列表 */
export function listPlans(): Promise<ApiResponse<PlanInfo[]>> {
  return get<ApiResponse<PlanInfo[]>>('/plans')
}

// ─── 用量 ─────────────────────────────────────────────────────────────────────

/** 获取当前团队当月 credit 用量 */
export function getMonthlyUsage(): Promise<ApiResponse<CreditUsage>> {
  return get<ApiResponse<CreditUsage>>('/credits/usage')
}
