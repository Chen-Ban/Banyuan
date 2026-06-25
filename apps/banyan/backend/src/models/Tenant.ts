import mongoose, { Schema, Document } from 'mongoose'
import type { ITenant } from './types/index.js'

type ITenantDoc = ITenant & Document

// ─── Schema ───────────────────────────────────────────────────────────────────

const TenantSchema = new Schema<ITenantDoc>(
  {
    tenantId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    plan: { type: String, enum: ['free', 'pro'], default: 'free' },
    planId: { type: String, default: undefined },
  },
  { timestamps: true, collection: 'tenants' },
)

export const Tenant = mongoose.model<ITenantDoc>('Tenant', TenantSchema)
