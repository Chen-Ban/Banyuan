import mongoose, { Schema, type Document } from 'mongoose'
import { CollectionDefSchema } from './CollectionSchema.js'
import { CloudFunctionDefSchema } from './CloudFunction.js'
import type { IDeploySnapshot, IDeployment } from './types/index.js'

// ─── Local Document type alias ────────────────────────────────────────────────

type IDeploymentDoc = IDeployment & Document

// ─── Schema ───────────────────────────────────────────────────────────────────

// ─── Snapshot 子 Schema ───────────────────────────────────────────────────────

const DeploySnapshotSubSchema = new Schema<IDeploySnapshot>(
  {
    appJSON: { type: String, required: true },
    collections: { type: [CollectionDefSchema], default: [] },
    cloudFunctions: { type: [CloudFunctionDefSchema], default: [] },
  },
  { _id: false }
)

// ─── Schema ───────────────────────────────────────────────────────────────────

const DeploymentSchema = new Schema<IDeploymentDoc>(
  {
    deploymentId: { type: String, required: true, unique: true, index: true },
    applicationId: { type: String, required: true, index: true },
    tenantId: { type: String, required: true, index: true },
    version: { type: Number, required: true },
    deployType: { type: String, enum: ['static', 'fullstack'], required: true },
    status: {
      type: String,
      enum: ['pending', 'building', 'deploying', 'success', 'failed'],
      default: 'pending',
    },
    currentStep: { type: String, default: undefined },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    url: { type: String, default: undefined },
    error: { type: String, default: undefined },
    triggeredBy: { type: String, required: true },
    snapshot: { type: DeploySnapshotSubSchema, default: undefined },
    startedAt: { type: Date, default: undefined },
    finishedAt: { type: Date, default: undefined },
  },
  { timestamps: true, collection: 'deployments' }
)

// 索引
DeploymentSchema.index({ tenantId: 1, applicationId: 1, createdAt: -1 })
DeploymentSchema.index({ status: 1 })

export const Deployment = mongoose.model<IDeploymentDoc>('Deployment', DeploymentSchema)
