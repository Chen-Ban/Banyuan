import mongoose, { Schema, Document } from 'mongoose'
import type { IUser } from './types/index.js'

export type { UserRole, UserStatus, IUser } from './types/index.js'

export type IUserDoc = IUser & Document

const UserSchema = new Schema<IUserDoc>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    tenantId: { type: String, required: true, index: true },
    email: { type: String, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    username: { type: String, required: true, trim: true },
    passwordHash: { type: String, select: false },
    role: { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
    status: { type: String, enum: ['active', 'invited', 'disabled'], default: 'active' },
  },
  { timestamps: true, collection: 'users' }
)

// 稀疏唯一索引（允许多个文档的该字段为 null/不存在）
UserSchema.index({ email: 1 }, { unique: true, sparse: true })
UserSchema.index({ phone: 1 }, { unique: true, sparse: true })

export const User = mongoose.model<IUserDoc>('User', UserSchema)
