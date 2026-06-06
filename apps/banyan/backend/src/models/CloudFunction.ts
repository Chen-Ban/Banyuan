import mongoose, { Schema } from 'mongoose'
import type { ICloudFunction } from './types/index.js'

/**
 * 云函数 Mongoose Model（FlowSchema 定义）
 *
 * 属于应用级资源，多页面共享。接口类型定义见 ./types/index.ts。
 */
export type { ICloudFunction } from './types/index.js'

// ─── 共享字段定义（供子文档 Schema 复用）───────────────────────────────────────

const cloudFunctionFields = {
  functionId: { type: String, required: true, trim: true },
  appId: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  displayName: { type: String, default: '', trim: true, maxlength: 200 },
  description: { type: String, default: '', trim: true, maxlength: 500 },
  flowSchema: { type: Schema.Types.Mixed, default: { nodes: [], edges: [] } },
  version: { type: Number, default: 1, min: 1 },
}

/**
 * 嵌入用子文档 Schema（无 _id，无 timestamps，无 unique 约束）
 *
 * Dialogue 和 Deployment 作为快照嵌入云函数完整定义时使用。
 */
export const CloudFunctionEmbedSchema = new Schema<ICloudFunction>(
  cloudFunctionFields,
  { _id: false }
)

// ─── 顶层集合 Schema ──────────────────────────────────────────────────────────

const CloudFunctionSchema = new Schema<ICloudFunction>(
  {
    ...cloudFunctionFields,
    functionId: { ...cloudFunctionFields.functionId, unique: true },
  },
  {
    timestamps: true,
  }
)

CloudFunctionSchema.index({ appId: 1, name: 1 }, { unique: true })
CloudFunctionSchema.index({ appId: 1, createdAt: -1 })

const CloudFunction = mongoose.model<ICloudFunction>('CloudFunction', CloudFunctionSchema)

export default CloudFunction
