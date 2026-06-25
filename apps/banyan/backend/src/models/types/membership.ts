/**
 * 成员关系（Membership）类型定义
 *
 * Membership 是 User ↔ Tenant 的 N:N 中间实体。
 * 一个用户可以加入多个租户，一个租户可以有多个用户。
 * 角色和状态在 Membership 上定义，User 是纯身份实体。
 */

export type MembershipRole = 'owner' | 'admin' | 'member'
export type MembershipStatus = 'active' | 'invited' | 'disabled'

export interface IMembership {
  membershipId: string
  userId: string
  tenantId: string
  role: MembershipRole
  status: MembershipStatus
  joinedAt: Date
  invitedBy?: string
  createdAt: Date
  updatedAt: Date
}
