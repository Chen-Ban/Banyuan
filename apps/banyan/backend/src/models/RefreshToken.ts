import mongoose, { Schema, Document } from 'mongoose'

export interface IRefreshToken extends Document {
  tokenId: string
  userId: string
  tenantId: string
  token: string
  expiresAt: Date
  revokedAt?: Date
  createdAt: Date
}

const RefreshTokenSchema = new Schema<IRefreshToken>(
  {
    tokenId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    tenantId: { type: String, required: true },
    token: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
  },
  { timestamps: true, collection: 'refreshtokens' }
)

// TTL 索引：过期后自动删除
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const RefreshToken = mongoose.model<IRefreshToken>('RefreshToken', RefreshTokenSchema)
