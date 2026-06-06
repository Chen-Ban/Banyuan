/**
 * 用户（User）类型定义
 */

export type UserRole = 'owner' | 'admin' | 'member'
export type UserStatus = 'active' | 'invited' | 'disabled'

export interface IUser {
  userId: string
  tenantId: string
  email?: string
  phone?: string
  username: string
  passwordHash?: string
  role: UserRole
  status: UserStatus
  createdAt: Date
  updatedAt: Date
}
