/**
 * 快照模型（Snapshot）
 *
 * 独立集合，通过 dialogueId 关联到 Conversation 中的 Dialogue。
 * 仅在 type=task 的对话完成（threadStatus=completed）时生成。
 *
 * 用途：
 *   - 记录每次"做任务"对话完成后的应用完整状态
 *   - 支持对话级别的撤销/恢复（回退到某个对话 = 恢复该对话的快照）
 *   - 对比前后快照可以看出一次对话做了什么改动
 *
 * 存储策略：
 *   - 独立集合避免 Conversation 文档膨胀（appJSON 可能很大）
 *   - 通过 dialogueId 唯一关联，一个 task 对话最多一个快照
 *   - 通过 appId + createdAt 索引支持按应用查询快照历史
 */

import mongoose, { Schema, Document, Types } from 'mongoose'

// ─── 云函数快照 ───────────────────────────────────────────────────────────────

export interface ICloudFunctionSnapshot {
  /** 云函数唯一标识 */
  functionId: string
  /** 云函数名称（英文标识符） */
  name: string
  /** 显示名称（中文） */
  displayName: string
  /** FlowSchema JSON（节点图） */
  flowSchema: unknown
}

// ─── 数据库表字段快照 ─────────────────────────────────────────────────────────

export interface IFieldSnapshot {
  name: string
  displayName: string
  type: string
  required: boolean
  defaultValue?: unknown
  refCollection?: string
  enumValues?: string[]
}

// ─── 数据库表快照 ─────────────────────────────────────────────────────────────

export interface ICollectionSnapshot {
  /** 集合名称（英文标识符） */
  name: string
  /** 显示名称 */
  displayName: string
  /** 字段定义数组 */
  fields: IFieldSnapshot[]
}

// ─── Snapshot 文档接口 ────────────────────────────────────────────────────────

export interface ISnapshot extends Document {
  /** 关联的应用 ID */
  appId: string
  /** 关联的 Dialogue._id */
  dialogueId: Types.ObjectId
  /** App 级别序列化字符串 */
  appJSON: string
  /** 云函数快照列表 */
  cloudFunctions: ICloudFunctionSnapshot[]
  /** 数据库表定义快照列表 */
  collections: ICollectionSnapshot[]
  /** 快照创建时间 */
  createdAt: Date
}

// ─── Schema 定义 ──────────────────────────────────────────────────────────────

const FieldSnapshotSchema = new Schema<IFieldSnapshot>(
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

const CollectionSnapshotSchema = new Schema<ICollectionSnapshot>(
  {
    name: { type: String, required: true },
    displayName: { type: String, required: true },
    fields: { type: [FieldSnapshotSchema], default: [] },
  },
  { _id: false }
)

const CloudFunctionSnapshotSchema = new Schema<ICloudFunctionSnapshot>(
  {
    functionId: { type: String, required: true },
    name: { type: String, required: true },
    displayName: { type: String, default: '' },
    flowSchema: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
)

const SnapshotSchema = new Schema<ISnapshot>(
  {
    appId: {
      type: String,
      required: true,
      trim: true,
    },
    dialogueId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    appJSON: {
      type: String,
      required: true,
      default: '',
    },
    cloudFunctions: {
      type: [CloudFunctionSnapshotSchema],
      default: [],
    },
    collections: {
      type: [CollectionSnapshotSchema],
      default: [],
    },
    createdAt: {
      type: Date,
      default: () => new Date(),
    },
  },
  {
    // 不使用 timestamps（只需要 createdAt，快照不可修改）
    timestamps: false,
  }
)

// ─── 索引 ─────────────────────────────────────────────────────────────────────

// 通过 dialogueId 唯一关联（一个 task 对话最多一个快照）
SnapshotSchema.index({ dialogueId: 1 }, { unique: true })

// 按应用查询快照历史（撤销/恢复时使用）
SnapshotSchema.index({ appId: 1, createdAt: -1 })

// ─── 模型 ─────────────────────────────────────────────────────────────────────

const Snapshot = mongoose.model<ISnapshot>('Snapshot', SnapshotSchema)

export default Snapshot
