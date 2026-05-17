import mongoose, { Schema, Document } from 'mongoose'
import type { FieldType } from './AppSchema.js'

// ── AppFunction 文档接口 ───────────────────────────────────────────────────────

export interface IAppFunction extends Document {
  appId: string
  /** 函数名（英文，用于调用，同一应用内唯一） */
  name: string
  /** 显示名称（中文友好） */
  displayName: string
  /** 功能描述（也是 AI 生成的 prompt） */
  description: string
  /** 函数体代码（TypeScript） */
  code: string
  /** 入参 Schema（用于前端绑定 UI） */
  inputSchema: Record<string, FieldType>
  /** 出参 Schema */
  outputSchema: Record<string, FieldType>
  createdAt: Date
  updatedAt: Date
}

// ── Mongoose Schema 定义 ──────────────────────────────────────────────────────

const AppFunctionSchema = new Schema<IAppFunction>(
  {
    appId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    displayName: { type: String, required: true },
    description: { type: String, default: '' },
    code: { type: String, required: true, default: '' },
    inputSchema: { type: Schema.Types.Mixed, default: {} },
    outputSchema: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
)

// 同一应用内函数名唯一
AppFunctionSchema.index({ appId: 1, name: 1 }, { unique: true })

export default mongoose.model<IAppFunction>('AppFunction', AppFunctionSchema)
