import mongoose, { Schema, Document } from 'mongoose'

export interface ITenant extends Document {
  tenantId: string
  name: string
  plan: 'free' | 'pro'
  createdAt: Date
  updatedAt: Date
}

const TenantSchema = new Schema<ITenant>(
  {
    tenantId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    plan: { type: String, enum: ['free', 'pro'], default: 'free' },
  },
  { timestamps: true, collection: 'tenants' }
)

export const Tenant = mongoose.model<ITenant>('Tenant', TenantSchema)
