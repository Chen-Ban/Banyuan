/**
 * 用户（User）类型定义
 *
 * User 是纯身份实体，不再持有 tenantId。
 * 用户与租户的关联关系由 Membership 模型承载（N:N）。
 * 角色（owner/admin/member）定义在 Membership 上。
 */

export type UserStatus = 'active' | 'invited' | 'disabled'

export interface IUser {
  userId: string
  email?: string
  phone?: string
  username: string
  passwordHash?: string
  status: UserStatus
  createdAt: Date
  updatedAt: Date
}
