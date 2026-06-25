import mongoose, { Schema, Document } from 'mongoose'
import type { ITenant } from './types/index.js'

type ITenantDoc = ITenant & Document

// ─── Schema ───────────────────────────────────────────────────────────────────

const TenantSchema = new Schema<ITenantDoc>(
  {
    tenantId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    plan: { type: String, enum: ['free', 'pro'], default: 'free' },

    // ECS 开通信息
    ecsInstanceId: { type: String, default: undefined },
    ecsPrivateIp: { type: String, default: undefined },
    eipAddress: { type: String, default: undefined },
    eipAllocationId: { type: String, default: undefined },
    domain: { type: String, default: undefined },
    agentToken: { type: String, default: undefined },
    provisionStatus: {
      type: String,
      enum: [
        'none',
        'pending',
        'creating_ecs',
        'configuring_dns',
        'initializing',
        'installing_agent',
        'ready',
        'failed',
      ],
      default: 'none',
    },
    provisionError: { type: String, default: undefined },
    provisionedAt: { type: Date, default: undefined },
  },
  { timestamps: true, collection: 'tenants' },
)

export const Tenant = mongoose.model<ITenantDoc>('Tenant', TenantSchema)
