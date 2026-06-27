import mongoose, { Schema, Document } from 'mongoose'
import type { IRefreshToken } from '../types/index.js'

type IRefreshTokenDoc = IRefreshToken & Document

const RefreshTokenSchema = new Schema<IRefreshTokenDoc>(
  {
    tokenId: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    teamId: { type: String },
    token: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
  },
  { timestamps: true, collection: 'refreshtokens' },
)

// TTL 索引：过期后自动删除
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const RefreshToken = mongoose.model<IRefreshTokenDoc>('RefreshToken', RefreshTokenSchema)
