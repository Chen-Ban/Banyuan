import mongoose, { Schema, Document } from 'mongoose'

// ── 打印模板相关类型 ──

/** 动态字段文本样式 */
export interface IPrintFieldTextStyle {
  fontSize: number
  fontWeight: 'normal' | 'bold'
  align: 'left' | 'center' | 'right'
  overflow: 'clip' | 'ellipsis' | 'shrink'
}

/** 条码/二维码样式 */
export interface IPrintFieldCodeStyle {
  format: 'CODE128' | 'EAN13' | 'QR'
  errorLevel?: 'L' | 'M' | 'Q' | 'H'
}

/** 打印模板动态字段描述 */
export interface IPrintField {
  /** 字段契约名（与业务方约定的 key） */
  key: string
  /** 字段显示名（给设计者看） */
  label: string
  /** 字段类型 */
  type: 'text' | 'barcode' | 'qrcode'
  /** 渲染区域（像素坐标，相对于背景图左上角） */
  bounds: { x: number; y: number; width: number; height: number }
  /** 文本排版配置 */
  textStyle?: IPrintFieldTextStyle
  /** 条码/二维码配置 */
  codeStyle?: IPrintFieldCodeStyle
  /** 默认值（预览用） */
  defaultValue?: string
}

/** 打印模板配置 */
export interface IPrintConfig {
  /** 纸张宽度 mm */
  paperWidth: 58 | 80
  /** 打印机分辨率 DPI */
  dpi: number
  /** 背景层位图（Base64 data URL） */
  backgroundImage: string
  /** 背景图像素尺寸 */
  backgroundSize: { width: number; height: number }
  /** 动态字段列表 */
  fields: IPrintField[]
}

// ── 模板文档接口 ──

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
  /** 多页面 JSON 字符串数组（BanvasGL Serializer 输出） */
  pages: string[]
  /** 标签 */
  tags: string[]
  /** 版本号（每次保存自增） */
  version: number
  /** 创建者 userId */
  createdBy: string
  /** 最后修改者 userId */
  updatedBy: string
  /** 打印模板配置（可选，仅打印模板有值） */
  printConfig: IPrintConfig | null
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
    pages: {
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
    printConfig: {
      type: Schema.Types.Mixed,
      default: null,
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
