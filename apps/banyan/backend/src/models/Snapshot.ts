/**
 * 快照模型（Snapshot）— V2（过程暂存 + 历史回滚统一）
 *
 * 独立集合，通过 appId + dialogueId 关联到 Conversation 中的 Dialogue。
 *
 * 生命周期：
 *   1. AI 开始执行 task 时创建（status=pending），此时 appJSON/collections/cloudFunctions 为空
 *   2. AI 执行期间每次产生副作用，增量更新 Snapshot 中对应的字段
 *   3. AI 执行完毕（SSE done），status 变为 done（暂存完成，等待用户确认）
 *   4a. 用户确认（confirm）：将 Snapshot 数据同步写入持久化表，status → confirmed
 *   4b. 用户撤销（discard）：status → discarded，持久化表不受影响
 *
 * 回滚：
 *   - 恢复到历史版本 = 取某个 confirmed 的 Snapshot，将其数据写回持久化表
 *   - 等价于对历史 Snapshot 执行一次 confirm 操作
 *
 * 优势（相比 PendingStore 文件暂存）：
 *   - 数据始终在 MongoDB，天然支持多实例部署和进程重启恢复
 *   - 暂存和回滚点是同一份数据，无需维护两套存储
 *   - 通过 status 字段区分暂存中/已确认/已丢弃，查询简单
 *
 * 索引设计：
 *   - { appId, dialogueId } unique：一个 task 对话最多一个快照
 *   - { appId, status, createdAt }：按应用查询已确认的快照历史（回滚）
 *   - { status, createdAt }：TTL 清理 discarded/超时 pending
 */

import mongoose, { Schema, Document, Types } from 'mongoose'

// ─── 快照状态 ─────────────────────────────────────────────────────────────────

/** 快照生命周期状态 */
export type SnapshotStatus =
  | 'pending'     // AI 执行中，正在收集副作用
  | 'done'        // AI 执行完毕，等待用户确认
  | 'confirmed'   // 用户已确认，数据已同步到持久化表
  | 'discarded'   // 用户已撤销，数据未同步

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
  /** 关联的 Dialogue._id（预生成，对话确认前就已确定） */
  dialogueId: Types.ObjectId
  /** 快照生命周期状态 */
  status: SnapshotStatus
  /** App 级别序列化字符串 */
  appJSON: string
  /** 云函数快照列表 */
  cloudFunctions: ICloudFunctionSnapshot[]
  /** 数据库表定义快照列表 */
  collections: ICollectionSnapshot[]
  /** 快照创建时间（AI 开始执行时） */
  createdAt: Date
  /** 状态变更时间（confirm/discard 时更新） */
  updatedAt: Date
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
    status: {
      type: String,
      enum: ['pending', 'done', 'confirmed', 'discarded'],
      required: true,
      default: 'pending',
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
  },
  {
    timestamps: true,
  }
)

// ─── 索引 ─────────────────────────────────────────────────────────────────────

// 通过 appId + dialogueId 唯一关联（一个 task 对话最多一个快照）
SnapshotSchema.index({ appId: 1, dialogueId: 1 }, { unique: true })

// 按应用查询已确认的快照历史（回滚 UI 使用）
SnapshotSchema.index({ appId: 1, status: 1, createdAt: -1 })

// 查找当前 pending/done 状态的快照（confirm/discard 时使用）
SnapshotSchema.index({ appId: 1, status: 1 })

// ─── 模型 ─────────────────────────────────────────────────────────────────────

const Snapshot = mongoose.model<ISnapshot>('Snapshot', SnapshotSchema)

export default Snapshot
