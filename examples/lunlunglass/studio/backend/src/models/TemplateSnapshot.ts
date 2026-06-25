import mongoose, { Schema, Document } from 'mongoose'
import type { IPrintField } from './Template.js'

/**
 * 模板快照文档接口
 *
 * 每次发布模板时生成一个快照，包含：
 * - 静态背景图（PNG Base64）
 * - 动态字段列表（fieldKey + bounds + 样式）
 * - 版本号和时间戳
 *
 * POS 系统通过 GET /templates/published 拉取快照列表，
 * 本地存储后打印时不依赖 Studio 在线。
 */
export interface ITemplateSnapshot extends Document {
  /** 快照唯一 ID */
  snapshotId: string
  /** 关联的模板 ID */
  templateId: string
  /** 模板名称（快照时记录，不随模板修改变化） */
  templateName: string
  /** 模板缩略图（快照时记录） */
  thumbnail: string
  /** 版本号（来自模板的 version 字段） */
  version: number
  /** 纸张宽度 mm */
  paperWidth: number
  /** DPI */
  dpi: number
  /** 静态背景图（Base64 data URL，exportImage() 导出） */
  backgroundImage: string
  /** 背景图像素尺寸 */
  backgroundSize: { width: number; height: number }
  /** 动态字段列表（仅绑定了 fieldKey 的 TextView） */
  fields: IPrintField[]
  /** 发布时间 */
  publishedAt: Date
  /** 创建时间 */
  createdAt: Date
}

const TemplateSnapshotSchema = new Schema<ITemplateSnapshot>(
  {
    snapshotId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    templateId: {
      type: String,
      required: true,
      trim: true,
    },
    templateName: {
      type: String,
      required: true,
      trim: true,
    },
    thumbnail: {
      type: String,
      default: '',
    },
    version: {
      type: Number,
      required: true,
      min: 1,
    },
    paperWidth: {
      type: Number,
      required: true,
    },
    dpi: {
      type: Number,
      required: true,
    },
    backgroundImage: {
      type: String,
      required: true,
    },
    backgroundSize: {
      type: Schema.Types.Mixed,
      required: true,
    },
    fields: {
      type: Schema.Types.Mixed,
      default: [],
    },
    publishedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
)

TemplateSnapshotSchema.index({ snapshotId: 1 }, { unique: true })
TemplateSnapshotSchema.index({ templateId: 1 })
TemplateSnapshotSchema.index({ publishedAt: -1 })

const TemplateSnapshot = mongoose.model<ITemplateSnapshot>('TemplateSnapshot', TemplateSnapshotSchema)

export default TemplateSnapshot
