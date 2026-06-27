import mongoose, { Schema, type Document } from 'mongoose'
import type { IMaterialDocument } from '../types/index.js'

// ─── Material Schema ───────────────────────────────────────────────────────────
//
// 物料文档采用嵌套结构，与基础库 @banyuan/banvasgl 的 IMaterial 一致：
//   { meta: IMaterialMeta, template: ITemplate }
// 后端在此之上附加 kind（render / client-flow / server-flow）与 applicationId 两个维度。

type IMaterialDoc = IMaterialDocument & Document

const MaterialParameterSchema = new Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    description: { type: String },
    type: {
      type: String,
      required: true,
      enum: ['string', 'number', 'boolean', 'color', 'url', 'enum', 'json'],
    },
    defaultValue: { type: Schema.Types.Mixed },
    bindingPath: { type: String, required: true },
    options: { type: [Schema.Types.Mixed] },
    required: { type: Boolean, default: false },
  },
  { _id: false },
)

const MaterialAssetSchema = new Schema(
  {
    id: { type: String, required: true },
    type: { type: String, required: true, enum: ['image', 'video', 'audio', 'font', 'other'] },
    url: { type: String, required: true },
    originalName: { type: String },
    size: { type: Number },
  },
  { _id: false },
)

const InternalIdRefSchema = new Schema(
  {
    path: { type: String, required: true },
    placeholder: { type: String, required: true },
  },
  { _id: false },
)

const MaterialTemplateSchema = new Schema(
  {
    root: { type: Schema.Types.Mixed, required: true },
    idCount: { type: Number, required: true, min: 0 },
    internalIdRefs: { type: [InternalIdRefSchema], default: [] },
    parameters: { type: [MaterialParameterSchema], default: [] },
    assets: { type: [MaterialAssetSchema], default: [] },
  },
  { _id: false },
)

const MaterialMetaSchema = new Schema(
  {
    id: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000 },
    tags: { type: [String], default: [] },
    thumbnail: { type: String, trim: true },
    source: {
      type: String,
      required: true,
      enum: ['builtin', 'user', 'team', 'marketplace'],
      default: 'user',
    },
    creatorId: { type: String, trim: true },
    // createdAt / updatedAt 以 ISO 字符串存储，与基础库 IMaterialMeta 一致
    createdAt: { type: String },
    updatedAt: { type: String },
    version: { type: String, default: '1.0.0', trim: true },
    minEngineVersion: { type: String, trim: true },
  },
  { _id: false },
)

const MaterialSchema = new Schema<IMaterialDoc>(
  {
    meta: {
      type: MaterialMetaSchema,
      required: true,
    },
    template: {
      type: MaterialTemplateSchema,
      required: true,
    },
    kind: {
      type: String,
      required: true,
      enum: ['render', 'client-flow', 'server-flow'],
      default: 'render',
    },
    applicationId: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    // 时间戳由 service 层写入 meta.createdAt / meta.updatedAt（ISO 字符串），
    // 不使用 Mongoose 顶层 timestamps，避免与嵌套 meta 重复。
    timestamps: false,
  },
)

// 创建索引 — meta.id 唯一约束仅对非 null 的 string 生效（兼容旧数据中残留的 null 文档）
MaterialSchema.index(
  { 'meta.id': 1 },
  { unique: true, partialFilterExpression: { 'meta.id': { $type: 'string' } } },
)
MaterialSchema.index({ 'meta.name': 'text', 'meta.description': 'text', 'meta.tags': 'text' })
MaterialSchema.index({ 'meta.tags': 1 })
MaterialSchema.index({ 'meta.source': 1 })
MaterialSchema.index({ 'meta.source': 1, kind: 1 })
MaterialSchema.index({ applicationId: 1 })
MaterialSchema.index({ applicationId: 1, kind: 1 })
MaterialSchema.index({ 'meta.createdAt': -1 })

const Material = mongoose.model<IMaterialDoc>('Material', MaterialSchema)

export default Material
