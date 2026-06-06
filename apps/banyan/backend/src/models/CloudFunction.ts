/**
 * CloudFunction 模型（ADR-042）— 云函数定义的 append-only 版本化集合
 *
 * 设计与 CollectionSchema 一致：
 *   - 同一 appId 可存在多个版本文档
 *   - 每次变更写入新版本（version+1），旧版本永不修改
 *   - 读取时通过 `findOne({ appId }).sort({ version: -1 })` 获取最新
 *   - 一个文档打包该应用的所有云函数定义 functions[]
 *
 * 嵌入用 Schema（CloudFunctionDefSchema）同时导出，供 Dialogue/Deployment 复用。
 */

import mongoose, { Schema } from 'mongoose'
import type { ICloudFunctionDef, ICloudFunctionGroup } from './types/versioned-content.js'

// ─── 云函数定义子文档 Schema（嵌入用）────────────────────────────────────────────

export const CloudFunctionDefSchema = new Schema<ICloudFunctionDef>(
  {
    functionId: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    displayName: { type: String, default: '', trim: true, maxlength: 200 },
    description: { type: String, default: '', trim: true, maxlength: 500 },
    flowSchema: { type: Schema.Types.Mixed, default: { nodes: [], edges: [] } },
  },
  { _id: false }
)

// ─── 顶层 Schema（append-only 版本化集合）──────────────────────────────────────

const CloudFunctionSchema = new Schema<ICloudFunctionGroup>(
  {
    appId: { type: String, required: true, trim: true },
    version: { type: Number, required: true, min: 1 },
    dialogueId: { type: Schema.Types.ObjectId, required: true, index: true },
    functions: { type: [CloudFunctionDefSchema], default: [] },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
)

// 联合唯一索引：同一 app 的版本号不可重复
CloudFunctionSchema.index({ appId: 1, version: -1 }, { unique: true })

const CloudFunction = mongoose.model<ICloudFunctionGroup>('CloudFunction', CloudFunctionSchema)

export default CloudFunction
