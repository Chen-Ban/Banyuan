import mongoose, { Schema, Document } from 'mongoose'

/**
 * 模板文档接口
 */
export interface ITemplate extends Document {
  /** 模板业务ID */
  id: string
  /** 模板名称 */
  name: string
  /** 模板描述 */
  description: string
  /** 缩略图 URL */
  thumbnail: string
  /** 多页面场景 JSON 字符串数组（BanvasGL Serializer 输出） */
  scenes: string[]
  /** 标签 */
  tags: string[]
  /** 版本号（每次保存自增） */
  version: number
  /** 创建者 userId */
  createdBy: string
  /** 最后修改者 userId */
  updatedBy: string
  /** 创建时间 */
  createdAt: Date
  /** 更新时间 */
  updatedAt: Date
}

/**
 * 模板 Schema
 */
const TemplateSchema = new Schema<ITemplate>(
  {
    id: {
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
    scenes: {
      type: [String],
      required: true,
      default: [],
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
TemplateSchema.index({ id: 1 }, { unique: true })
TemplateSchema.index({ name: 1 })
TemplateSchema.index({ tags: 1 })
TemplateSchema.index({ createdBy: 1 })
TemplateSchema.index({ createdAt: -1 })

/**
 * 模板模型
 */
const Template = mongoose.model<ITemplate>('Template', TemplateSchema)

export default Template
