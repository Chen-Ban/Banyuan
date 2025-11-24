import mongoose, { Schema, Document } from 'mongoose'

/**
 * 模板文档接口
 */
export interface ITemplate extends Document {
  /** 模板业务ID */
  id: string
  /** 模板名称 */
  name: string
  /** Scene 的 JSON 字符串 */
  template: string
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
    template: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true, // 自动添加 createdAt 和 updatedAt
  }
)

// 创建索引
TemplateSchema.index({ id: 1 }, { unique: true })
TemplateSchema.index({ name: 1 })
TemplateSchema.index({ createdAt: -1 })

/**
 * 模板模型
 */
const Template = mongoose.model<ITemplate>('Template', TemplateSchema)

export default Template

