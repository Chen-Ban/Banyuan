import mongoose, { Schema, Document } from 'mongoose'

// ─── 应用文档接口 ──────────────────────────────────────────────────────────────

/**
 * 应用文档接口
 */
export interface IApplication extends Document {
  /** 应用业务ID */
  application_id: string
  /** 应用名称 */
  name: string
  /** 应用描述 */
  description: string
  /** 缩略图 URL */
  thumbnail: string
  /** 完整 App 序列化 JSON（BanvasGL Serializer 输出，包含 lifetimes + scenes） */
  appJSON: string
  /** 标签 */
  tags: string[]
  /** 版本号（每次保存自增） */
  version: number
  /** 租户 ID */
  tenantId: string
  /** 创建者 */
  createdBy: string
  /** 最后修改者 */
  updatedBy: string

  // ─── Web 发布相关（ADR-028）─────────────────────────────────────────────────
  /** 应用 URL slug（用于子域名路由，如 my-app → my-app.tenant.banyuan.club） */
  appSlug?: string
  /** 已发布的版本号（null 表示从未发布） */
  publishedVersion?: number
  /** Web 访问 URL（发布后填充） */
  webUrl?: string
  /** 最近一次部署时间 */
  lastDeployedAt?: Date
  /** 部署类型 */
  deployType?: 'static' | 'fullstack'

  /** 创建时间 */
  createdAt: Date
  /** 更新时间 */
  updatedAt: Date
}

// ─── Application Schema ───────────────────────────────────────────────────────

const ApplicationSchema = new Schema<IApplication>(
  {
    application_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: 1000,
    },
    thumbnail: {
      type: String,
      default: '',
      trim: true,
    },
    appJSON: {
      // 注意：不能加 required: true。
      // Mongoose 的 String required 校验会把空字符串 '' 视为「缺失」而校验失败，
      // 而新建空白应用的初始 appJSON 合法值就是空字符串，因此只保留 default。
      type: String,
      default: '',
    },
    tags: {
      type: [String],
      default: [],
    },
    version: {
      type: Number,
      default: 1,
      min: 1,
    },
    tenantId: {
      type: String,
      default: '',
      trim: true,
    },
    createdBy: {
      type: String,
      default: '',
      trim: true,
    },
    updatedBy: {
      type: String,
      default: '',
      trim: true,
    },

    // Web 发布相关（ADR-028）
    appSlug: {
      type: String,
      default: undefined,
      trim: true,
      sparse: true,
    },
    publishedVersion: {
      type: Number,
      default: undefined,
    },
    webUrl: {
      type: String,
      default: undefined,
      trim: true,
    },
    lastDeployedAt: {
      type: Date,
      default: undefined,
    },
    deployType: {
      type: String,
      enum: ['static', 'fullstack'],
      default: undefined,
    },
  },
  {
    timestamps: true,
  }
)

// 创建索引
ApplicationSchema.index({ application_id: 1 }, { unique: true })
ApplicationSchema.index({ name: 1 })
ApplicationSchema.index({ tags: 1 })
ApplicationSchema.index({ createdBy: 1 })
ApplicationSchema.index({ createdAt: -1 })
ApplicationSchema.index({ tenantId: 1, createdBy: 1 })
ApplicationSchema.index({ tenantId: 1, appSlug: 1 }, { unique: true, sparse: true })

const Application = mongoose.model<IApplication>('Application', ApplicationSchema)

export default Application
