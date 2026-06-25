/**
 * RefreshToken 类型定义
 */

export interface IRefreshToken {
  tokenId: string
  userId: string
  /** 创建时的租户上下文（可选：用户可能没有活跃租户） */
  tenantId?: string
  token: string
  expiresAt: Date
  revokedAt?: Date
  createdAt: Date
}
