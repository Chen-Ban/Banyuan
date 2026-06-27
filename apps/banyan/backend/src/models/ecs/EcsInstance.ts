import mongoose, { Schema, Document } from 'mongoose'
import type { IEcsInstance, IEcsMetric } from '../types/index.js'

type IEcsInstanceDoc = IEcsInstance & Document

const EcsMetricSchema = new Schema<IEcsMetric>(
  {
    timestamp: { type: Date, required: true, default: Date.now },
    cpu: { type: Number, required: true },
    memory: { type: Number, required: true },
    disk: { type: Number, required: true },
  },
  { _id: false },
)

const EcsInstanceSchema = new Schema<IEcsInstanceDoc>(
  {
    instanceId: { type: String, required: true, unique: true, index: true },
    teamId: { type: String, default: undefined, sparse: true },
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
    metrics: { type: [EcsMetricSchema], default: [] },
  },
  { timestamps: true, collection: 'ecs_instances' },
)

// 按 teamId 查询当前绑定实例（sparse 允许多个文档 teamId 为 null）
EcsInstanceSchema.index({ teamId: 1 }, { sparse: true })

export const EcsInstance = mongoose.model<IEcsInstanceDoc>('EcsInstance', EcsInstanceSchema)
