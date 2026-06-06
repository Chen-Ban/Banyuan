/**
 * RefreshToken 类型定义
 */

export interface IRefreshToken {
  tokenId: string
  userId: string
  tenantId: string
  token: string
  expiresAt: Date
  revokedAt?: Date
  createdAt: Date
}
