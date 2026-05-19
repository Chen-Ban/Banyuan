import mongoose, { Schema, Document } from 'mongoose'

/**
 * 云函数（FlowSchema 定义）
 *
 * 每个云函数对应一个可视化编排的 FlowSchema，
 * 属于应用级资源，多页面共享。
 */
export interface ICloudFunction extends Document {
  /** 云函数唯一标识（UUID） */
  functionId: string
  /** 所属应用 ID */
  appId: string
  /** 云函数名称（英文标识符，如 submitOrder） */
  name: string
  /** 显示名称（中文） */
  displayName: string
  /** 描述 */
  description: string
  /** FlowSchema JSON（{ nodes: [], edges: [] }） */
  schema: Record<string, unknown>
  /** 版本号 */
  version: number
  createdAt: Date
  updatedAt: Date
}

const CloudFunctionSchema = new Schema<ICloudFunction>(
  {
    functionId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    appId: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    displayName: {
      type: String,
      default: '',
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: 500,
    },
    schema: {
      type: Schema.Types.Mixed,
      default: { nodes: [], edges: [] },
    },
    version: {
      type: Number,
      default: 1,
      min: 1,
    },
  },
  {
    timestamps: true,
  }
)

CloudFunctionSchema.index({ appId: 1, name: 1 }, { unique: true })
CloudFunctionSchema.index({ appId: 1, createdAt: -1 })

const CloudFunction = mongoose.model<ICloudFunction>('CloudFunction', CloudFunctionSchema)

export default CloudFunction
