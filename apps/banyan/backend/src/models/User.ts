import mongoose, { Schema, Document } from 'mongoose'

export type UserRole = 'owner' | 'admin' | 'member'
export type UserStatus = 'active' | 'invited' | 'disabled'

export interface IUser extends Document {
  userId: string
  tenantId: string
  email: string
  username: string
  passwordHash: string
  role: UserRole
  status: UserStatus
  createdAt: Date
  updatedAt: Date
}

const UserSchema = new Schema<IUser>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    tenantId: { type: String, required: true, index: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    username: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
    status: { type: String, enum: ['active', 'invited', 'disabled'], default: 'active' },
  },
  { timestamps: true, collection: 'users' }
)

// 复合索引：租户内邮件唯一
UserSchema.index({ tenantId: 1, email: 1 }, { unique: true })

export const User = mongoose.model<IUser>('User', UserSchema)
