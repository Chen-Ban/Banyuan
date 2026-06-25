import mongoose, { Schema, Document } from 'mongoose'
import type { IMembership } from './types/index.js'

export type IMembershipDoc = IMembership & Document

const MembershipSchema = new Schema<IMembershipDoc>(
  {
    membershipId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true },
    tenantId: { type: String, required: true },
    role: { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
    status: { type: String, enum: ['active', 'invited', 'disabled'], default: 'active' },
    joinedAt: { type: Date, default: Date.now },
    invitedBy: { type: String, default: undefined },
  },
  { timestamps: true, collection: 'memberships' },
)

// 联合唯一索引：同一用户在同一个租户中只有一个 membership
MembershipSchema.index({ userId: 1, tenantId: 1 }, { unique: true })
// 按用户查询其所有租户
MembershipSchema.index({ userId: 1 })
// 按租户查询其所有成员
MembershipSchema.index({ tenantId: 1 })

export const Membership = mongoose.model<IMembershipDoc>('Membership', MembershipSchema)
