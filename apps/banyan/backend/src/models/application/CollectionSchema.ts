/**
 * CollectionSchema 模型（ADR-042 升级：append-only 版本化）
 *
 * 改动：移除 appId unique 约束，改为 { appId, version } 联合 unique。
 * 同一 appId 可存在多个版本文档，每次变更写入新版本，旧版本永不修改。
 * Application 通过 currentCollectionSchemaVersion 指针关联当前版本。
 */

import mongoose, { Schema } from 'mongoose'
import type { Document } from 'mongoose'
import type { IFieldDef, ICollectionDef, ICollectionSchema } from '../types/index.js'

// ── 本地文档类型别名 ───────────────────────────────────────────────────────────

type ICollectionSchemaDoc = ICollectionSchema & Document

// ── Mongoose Schema 定义 ──────────────────────────────────────────────────────

export const FieldDefSchema = new Schema<IFieldDef>(
  {
    name: { type: String, required: true },
    displayName: { type: String, required: true },
    type: {
      type: String,
      required: true,
      enum: ['string', 'number', 'boolean', 'date', 'enum', 'ref', 'array', 'object'],
    },
    required: { type: Boolean, required: true, default: false },
    defaultValue: { type: Schema.Types.Mixed },
    refCollection: { type: String },
    enumValues: { type: [String] },
  },
  { _id: false },
)

export const CollectionDefSchema = new Schema<ICollectionDef>(
  {
    name: { type: String, required: true },
    displayName: { type: String, required: true },
    fields: { type: [FieldDefSchema], default: [] },
  },
  { _id: false },
)

const CollectionSchemaDefinition = new Schema<ICollectionSchemaDoc>(
  {
    appId: { type: String, required: true, index: true },
    collections: { type: [CollectionDefSchema], default: [] },
    version: { type: Number, required: true, default: 1 },
    dialogueId: { type: Schema.Types.ObjectId, required: true, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

// ADR-042: 联合唯一索引（同一 app 的版本号不可重复）
CollectionSchemaDefinition.index({ appId: 1, version: -1 }, { unique: true })

export default mongoose.model<ICollectionSchemaDoc>('CollectionSchema', CollectionSchemaDefinition)
