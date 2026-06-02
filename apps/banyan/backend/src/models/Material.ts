import mongoose, { Schema, Document } from 'mongoose'

// ─── 物料文档接口 ──────────────────────────────────────────────────────────────

/** 物料来源 */
export type MaterialSource = 'builtin' | 'user' | 'team' | 'marketplace'

/** 物料状态 */
export type MaterialStatus = 'active' | 'deprecated' | 'draft'

/** 物料种类：render 渲染物料（图形/文本/媒体/容器）/ flow 流程节点物料 */
export type MaterialKind = 'render' | 'flow'

/** 物料参数类型 */
export type MaterialParameterType = 'string' | 'number' | 'boolean' | 'color' | 'url' | 'enum' | 'json'

/** 物料参数定义 */
export interface IMaterialParameter {
  id: string
  label: string
  description?: string
  type: MaterialParameterType
  defaultValue: unknown
  bindingPath: string
  options?: Array<{ label: string; value: unknown }>
  required?: boolean
}

/** 物料资源 */
export interface IMaterialAsset {
  id: string
  type: 'image' | 'video' | 'audio' | 'font' | 'other'
  url: string
  originalName?: string
  size?: number
}

/** FlowSchema 内部 ID 引用 */
export interface IInternalIdRef {
  path: string
  placeholder: string
}

/** 物料模板 */
export interface IMaterialTemplate {
  root: Record<string, unknown>
  idCount: number
  internalIdRefs: IInternalIdRef[]
  parameters: IMaterialParameter[]
  assets: IMaterialAsset[]
}

/**
 * 物料文档接口
 */
export interface IMaterial extends Document {
  /** 物料业务 ID */
  material_id: string
  /** 物料名称 */
  name: string
  /** 物料描述 */
  description: string
  /** 分类标签 */
  tags: string[]
  /** 物料种类（render 渲染物料 / flow 流程节点物料） */
  kind: MaterialKind
  /** 缩略图（内置物料为内联 svg 字符串，用户物料为 URL） */
  thumbnail: string
  /** 物料来源 */
  source: MaterialSource
  /** 物料状态 */
  status: MaterialStatus
  /** 物料版本号（语义化版本） */
  version: string
  /** 兼容的 BanvasGL 最低版本 */
  minEngineVersion: string
  /** 物料模板（序列化后的视图子树） */
  template: IMaterialTemplate
  /** 租户 ID */
  tenantId: string
  /** 创建者 */
  createdBy: string
  /** 最后修改者 */
  updatedBy: string
  /** 创建时间 */
  createdAt: Date
  /** 更新时间 */
  updatedAt: Date
}

// ─── Material Schema ───────────────────────────────────────────────────────────

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

const MaterialSchema = new Schema<IMaterial>(
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

const Material = mongoose.model<IMaterial>('Material', MaterialSchema)

export default Material
