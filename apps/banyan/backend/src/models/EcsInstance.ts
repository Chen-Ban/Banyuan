import mongoose, { Schema, Document } from 'mongoose'
import type { IEcsInstance } from './types/index.js'

type IEcsInstanceDoc = IEcsInstance & Document

const EcsInstanceSchema = new Schema<IEcsInstanceDoc>(
  {
    instanceId: { type: String, required: true, unique: true, index: true },
    tenantId: { type: String, default: undefined, sparse: true },
    ecsPrivateIp: { type: String, required: true },
    eipAddress: { type: String, default: undefined },
    eipAllocationId: { type: String, default: undefined },
    domain: { type: String, default: undefined },
    agentToken: { type: String, required: true },
    status: {
      type: String,
      enum: ['creating', 'running', 'allocating', 'ready', 'deprovisioning', 'terminated'],
      default: 'creating',
    },
    provisionError: { type: String, default: undefined },
    provisionedAt: { type: Date, default: undefined },
    terminatedAt: { type: Date, default: undefined },
  },
  { timestamps: true, collection: 'ecs_instances' },
)

// 按 tenantId 查询当前绑定实例（sparse 允许多个文档 tenantId 为 null）
EcsInstanceSchema.index({ tenantId: 1 }, { sparse: true })

export const EcsInstance = mongoose.model<IEcsInstanceDoc>('EcsInstance', EcsInstanceSchema)
