import mongoose, { Schema, Document } from 'mongoose'
import type { ICollectionSnapshot, ICloudFunctionSnapshot, IFieldSnapshot } from './types/snapshot-types.js'

// ─── 部署状态 ─────────────────────────────────────────────────────────────────

export type DeployStatus =
  | 'pending'      // 等待 agent 接收
  | 'building'     // 构建中（scaffold + install + vite build）
  | 'deploying'    // 部署中（配置 nginx / 启动容器）
  | 'success'      // 部署成功
  | 'failed'       // 部署失败

// ─── 部署记录接口 ─────────────────────────────────────────────────────────────

// ─── 发布快照（Publish Snapshot）──────────────────────────────────────────────
// 每次 publish 时将发送给 agent 的完整数据冻结在此，支持回滚时原样重发

export interface IDeploySnapshot {
  /** 完整的 appJSON（序列化字符串，与 Snapshot 模型一致） */
  appJSON: string
  /** 数据库表定义（fullstack 模式下） */
  collections: ICollectionSnapshot[]
  /** 云函数定义（fullstack 模式下） */
  cloudFunctions: ICloudFunctionSnapshot[]
}

// ─── 部署记录接口 ─────────────────────────────────────────────────────────────

export interface IDeployment extends Document {
  /** 部署记录 ID */
  deploymentId: string
  /** 关联的应用 ID */
  applicationId: string
  /** 租户 ID */
  tenantId: string
  /** 部署的应用版本号 */
  version: number
  /** 部署类型 */
  deployType: 'static' | 'fullstack'
  /** 部署状态 */
  status: DeployStatus
  /** 当前步骤描述 */
  currentStep?: string
  /** 进度百分比 0-100 */
  progress: number
  /** 部署成功后的访问 URL */
  url?: string
  /** 错误信息 */
  error?: string
  /** 触发人 */
  triggeredBy: string
  /** 发布数据快照 —— 回滚时从此处取出完整数据重新部署 */
  snapshot?: IDeploySnapshot
  /** 部署开始时间 */
  startedAt?: Date
  /** 部署完成时间 */
  finishedAt?: Date
  createdAt: Date
  updatedAt: Date
}

// ─── Schema ───────────────────────────────────────────────────────────────────

// ─── Snapshot 子 Schema ───────────────────────────────────────────────────────

const FieldSnapshotSubSchema = new Schema<IFieldSnapshot>(
  {
    name: { type: String, required: true },
    displayName: { type: String, required: true },
    type: { type: String, required: true },
    required: { type: Boolean, default: false },
    defaultValue: { type: Schema.Types.Mixed, default: undefined },
    refCollection: { type: String, default: undefined },
    enumValues: { type: [String], default: undefined },
  },
  { _id: false }
)

const CollectionSnapshotSubSchema = new Schema<ICollectionSnapshot>(
  {
    name: { type: String, required: true },
    displayName: { type: String, required: true },
    fields: { type: [FieldSnapshotSubSchema], default: [] },
  },
  { _id: false }
)

const CloudFunctionSnapshotSubSchema = new Schema<ICloudFunctionSnapshot>(
  {
    functionId: { type: String, required: true },
    name: { type: String, required: true },
    displayName: { type: String, default: '' },
    flowSchema: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
)

const DeploySnapshotSubSchema = new Schema<IDeploySnapshot>(
  {
    appJSON: { type: String, required: true },
    collections: { type: [CollectionSnapshotSubSchema], default: [] },
    cloudFunctions: { type: [CloudFunctionSnapshotSubSchema], default: [] },
  },
  { _id: false }
)

// ─── Schema ───────────────────────────────────────────────────────────────────

const DeploymentSchema = new Schema<IDeployment>(
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

export const Deployment = mongoose.model<IDeployment>('Deployment', DeploymentSchema)
