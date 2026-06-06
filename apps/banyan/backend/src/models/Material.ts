import mongoose, { Schema, type Document } from 'mongoose'
import type { IMaterial } from './types/index.js'

export type { MaterialSource, MaterialStatus, MaterialKind, MaterialParameterType, IMaterialParameter, IMaterialAsset, IInternalIdRef, IMaterialTemplate, IMaterial } from './types/index.js'

// ─── Material Schema ───────────────────────────────────────────────────────────

type IMaterialDoc = IMaterial & Document

const MaterialParameterSchema = new Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    description: { type: String },
    type: { type: String, required: true, enum: ['string', 'number', 'boolean', 'color', 'url', 'enum', 'json'] },
    defaultValue: { type: Schema.Types.Mixed },
    bindingPath: { type: String, required: true },
    options: { type: [Schema.Types.Mixed] },
    required: { type: Boolean, default: false },
  },
  { _id: false }
)

const MaterialAssetSchema = new Schema(
  {
    id: { type: String, required: true },
    type: { type: String, required: true, enum: ['image', 'video', 'audio', 'font', 'other'] },
    url: { type: String, required: true },
    originalName: { type: String },
    size: { type: Number },
  },
  { _id: false }
)

const InternalIdRefSchema = new Schema(
  {
    path: { type: String, required: true },
    placeholder: { type: String, required: true },
  },
  { _id: false }
)

const MaterialTemplateSchema = new Schema(
  {
    root: { type: Schema.Types.Mixed, required: true },
    idCount: { type: Number, required: true, min: 0 },
    internalIdRefs: { type: [InternalIdRefSchema], default: [] },
    parameters: { type: [MaterialParameterSchema], default: [] },
    assets: { type: [MaterialAssetSchema], default: [] },
  },
  { _id: false }
)

const MaterialSchema = new Schema<IMaterialDoc>(
  {
    material_id: {
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
      maxlength: 2000,
    },
    tags: {
      type: [String],
      default: [],
    },
    kind: {
      type: String,
      required: true,
      enum: ['render', 'flow'],
      default: 'render',
    },
    thumbnail: {
      type: String,
      default: '',
      trim: true,
    },
    source: {
      type: String,
      required: true,
      enum: ['builtin', 'user', 'team', 'marketplace'],
      default: 'user',
    },
    status: {
      type: String,
      required: true,
      enum: ['active', 'deprecated', 'draft'],
      default: 'active',
    },
    version: {
      type: String,
      default: '1.0.0',
      trim: true,
    },
    minEngineVersion: {
      type: String,
      default: '',
      trim: true,
    },
    template: {
      type: MaterialTemplateSchema,
      required: true,
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
  },
  {
    timestamps: true,
  }
)

// 创建索引
MaterialSchema.index({ material_id: 1 }, { unique: true })
MaterialSchema.index({ name: 'text', description: 'text', tags: 'text' })
MaterialSchema.index({ tags: 1 })
MaterialSchema.index({ source: 1 })
MaterialSchema.index({ source: 1, kind: 1 })
MaterialSchema.index({ status: 1 })
MaterialSchema.index({ createdBy: 1 })
MaterialSchema.index({ tenantId: 1, createdBy: 1 })
MaterialSchema.index({ createdAt: -1 })

const Material = mongoose.model<IMaterialDoc>('Material', MaterialSchema)

export default Material
