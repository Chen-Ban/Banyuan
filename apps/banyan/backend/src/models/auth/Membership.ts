import mongoose, { Schema, Document } from 'mongoose'
import type { IMembership } from '../types/index.js'

export type IMembershipDoc = IMembership & Document

const MembershipSchema = new Schema<IMembershipDoc>(
  {
    membershipId: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    teamId: { type: String, required: true },
    role: { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
    status: { type: String, enum: ['active', 'invited', 'disabled'], default: 'active' },
    joinedAt: { type: Date, default: Date.now },
    invitedBy: { type: String },
  },
  { timestamps: true, collection: 'memberships' },
)

// 联合唯一索引：同一用户在同一个团队中只有一个 membership
// 同时覆盖按 userId 查询的场景（复合索引前缀规则），无需额外单列索引
MembershipSchema.index({ userId: 1, teamId: 1 }, { unique: true })
// 按团队查询其所有成员
MembershipSchema.index({ teamId: 1 })

export const Membership = mongoose.model<IMembershipDoc>('Membership', MembershipSchema)
