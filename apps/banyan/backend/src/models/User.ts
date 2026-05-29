import mongoose, { Schema, Document } from 'mongoose'

export type UserRole = 'owner' | 'admin' | 'member'
export type UserStatus = 'active' | 'invited' | 'disabled'

export interface IUser extends Document {
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

const UserSchema = new Schema<IUser>(
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

export const User = mongoose.model<IUser>('User', UserSchema)
