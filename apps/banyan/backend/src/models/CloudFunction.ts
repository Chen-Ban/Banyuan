import mongoose, { Schema } from 'mongoose'

/**
 * 云函数（FlowSchema 定义）
 *
 * 每个云函数对应一个可视化编排的 FlowSchema，
 * 属于应用级资源，多页面共享。
 */
export interface ICloudFunction {
  /** 云函数唯一标识（UUID） */
  functionId: string
  /** 所属应用 ID */
  appId: string
  /** 云函数名称（英文标识符，如 submitOrder） */
  name: string
  /** 显示名称（中文） */
  displayName: string
  /** 描述 */
  description: string
  /** FlowSchema JSON（{ nodes: [], edges: [] }） */
  flowSchema: Record<string, unknown>
  /** 版本号 */
  version: number
  createdAt: Date
  updatedAt: Date
}

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
