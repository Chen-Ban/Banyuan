import mongoose, { Schema } from 'mongoose'
import type { Document } from 'mongoose'
import type { IApplication } from './types/index.js'

// ─── Application Schema ───────────────────────────────────────────────────────

type IApplicationDoc = IApplication & Document

const ApplicationSchema = new Schema<IApplicationDoc>(
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

const Application = mongoose.model<IApplicationDoc>('Application', ApplicationSchema)

export default Application
