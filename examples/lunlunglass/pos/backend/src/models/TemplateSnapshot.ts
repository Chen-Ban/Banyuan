import mongoose, { Schema, Document } from 'mongoose'

/**
 * 模板快照文档接口（POS 本地存储）
 *
 * POS 从 Studio 拉取已发布模板快照后，本地存储在此集合中。
 * 打印时直接使用本地快照，不依赖 Studio 在线。
 */

/** 打印字段描述（从 Studio 快照中同步） */
export interface ISnapshotField {
  key: string
  label: string
  type: 'text' | 'barcode' | 'qrcode'
  bounds: { x: number; y: number; width: number; height: number }
  textStyle?: {
    fontSize: number
    fontWeight: string
    align: 'left' | 'center' | 'right'
    overflow: 'clip' | 'ellipsis' | 'shrink'
  }
  codeStyle?: {
    format?: string
    errorLevel?: 'L' | 'M' | 'Q' | 'H'
  }
  defaultValue?: string
}

export interface ITemplateSnapshot extends Document {
  /** 快照唯一 ID（来自 Studio） */
  snapshotId: string
  /** 关联的模板 ID（来自 Studio） */
  templateId: string
  /** 模板名称 */
  templateName: string
  /** 模板缩略图 */
  thumbnail: string
  /** 版本号 */
  version: number
  /** 纸张宽度 mm */
  paperWidth: number
  /** DPI */
  dpi: number
  /** 静态背景图（Base64 data URL） */
  backgroundImage: string
  /** 背景图像素尺寸 */
  backgroundSize: { width: number; height: number }
  /** 动态字段列表 */
  fields: ISnapshotField[]
  /** Studio 发布时间 */
  publishedAt: Date
  /** POS 同步时间 */
  syncedAt: Date
  /** 创建时间 */
  createdAt: Date
}

const SnapshotFieldSchema = new Schema<ISnapshotField>(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    type: { type: String, enum: ['text', 'barcode', 'qrcode'], required: true },
    bounds: { type: Schema.Types.Mixed, required: true },
    textStyle: { type: Schema.Types.Mixed },
    codeStyle: { type: Schema.Types.Mixed },
    defaultValue: { type: String },
  },
  { _id: false },
)

const TemplateSnapshotSchema = new Schema<ITemplateSnapshot>(
  {
    snapshotId: { type: String, required: true, unique: true, trim: true },
    templateId: { type: String, required: true, trim: true },
    templateName: { type: String, required: true, trim: true },
    thumbnail: { type: String, default: '' },
    version: { type: Number, required: true, min: 1 },
    paperWidth: { type: Number, required: true },
    dpi: { type: Number, required: true },
    backgroundImage: { type: String, required: true },
    backgroundSize: { type: Schema.Types.Mixed, required: true },
    fields: { type: [SnapshotFieldSchema], default: [] },
    publishedAt: { type: Date, required: true },
    syncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
)

TemplateSnapshotSchema.index({ snapshotId: 1 }, { unique: true })
TemplateSnapshotSchema.index({ templateId: 1 })
TemplateSnapshotSchema.index({ syncedAt: -1 })

const TemplateSnapshot = mongoose.model<ITemplateSnapshot>('TemplateSnapshot', TemplateSnapshotSchema)

export default TemplateSnapshot
