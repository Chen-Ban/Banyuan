/**
 * Application 模型（ADR-042）— 纯元数据壳
 *
 * appJSON / collectionSchema / cloudFunctions 已拆分到独立的 append-only 内容表（UIDefinition / CollectionSchema / CloudFunction）。
 * 读取内容时通过 appId 查内容表最新版本即可，无需版本指针。
 */

import mongoose, { Schema } from 'mongoose'
import type { Document } from 'mongoose'
import type { IApplication } from '../types/index.js'

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
    thumbnail: {
      type: String,
      default: '',
      trim: true,
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
    teamId: {
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
    visibility: {
      type: String,
      enum: ['private', 'team'],
      default: 'private',
    },

    // Web 发布相关（ADR-028）
    appSlug: { type: String, trim: true },
    aiLimit: { type: Number },
  },
  {
    timestamps: true,
    collection: 'applications',
  },
)

// 创建索引
ApplicationSchema.index({ application_id: 1 }, { unique: true })
ApplicationSchema.index({ name: 1 })
ApplicationSchema.index({ tags: 1 })
ApplicationSchema.index({ createdBy: 1 })
ApplicationSchema.index({ createdAt: -1 })
ApplicationSchema.index({ teamId: 1, createdBy: 1 })
// 同一团队下 appSlug 唯一（仅对非 null 的 string 生效）
ApplicationSchema.index(
  { teamId: 1, appSlug: 1 },
  { unique: true, partialFilterExpression: { appSlug: { $type: 'string' } } },
)

const Application = mongoose.model<IApplicationDoc>('Application', ApplicationSchema)

export default Application
