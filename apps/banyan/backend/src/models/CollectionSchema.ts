import mongoose, { Schema, Document } from 'mongoose'

// ── 字段类型枚举 ──────────────────────────────────────────────────────────────

export type FieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'enum'
  | 'ref'
  | 'array'
  | 'object'

// ── 字段定义 ──────────────────────────────────────────────────────────────────

export interface IFieldDef {
  name: string
  displayName: string
  type: FieldType
  required: boolean
  defaultValue?: unknown
  /** type === 'ref' 时，关联的 Collection 名称 */
  refCollection?: string
  /** type === 'enum' 时的可选值列表 */
  enumValues?: string[]
}

// ── Collection 定义 ───────────────────────────────────────────────────────────

export interface ICollectionDef {
  name: string
  displayName: string
  fields: IFieldDef[]
}

// ── CollectionSchema 文档接口 ──────────────────────────────────────────────────

export interface ICollectionSchema extends Document {
  appId: string
  collections: ICollectionDef[]
  version: number
  createdAt: Date
  updatedAt: Date
}

// ── Mongoose Schema 定义 ──────────────────────────────────────────────────────

export const FieldDefSchema = new Schema<IFieldDef>(
  {
    name: { type: String, required: true },
    displayName: { type: String, required: true },
    type: {
      type: String,
      required: true,
      enum: ['string', 'number', 'boolean', 'date', 'enum', 'ref', 'array', 'object'],
    },
    required: { type: Boolean, required: true, default: false },
    defaultValue: { type: Schema.Types.Mixed },
    refCollection: { type: String },
    enumValues: { type: [String] },
  },
  { _id: false },
)

export const CollectionDefSchema = new Schema<ICollectionDef>(
  {
    name: { type: String, required: true },
    displayName: { type: String, required: true },
    fields: { type: [FieldDefSchema], default: [] },
  },
  { _id: false },
)

const CollectionSchemaDefinition = new Schema<ICollectionSchema>(
  {
    appId: { type: String, required: true, unique: true, index: true },
    collections: { type: [CollectionDefSchema], default: [] },
    version: { type: Number, required: true, default: 1 },
  },
  { timestamps: true },
)

export default mongoose.model<ICollectionSchema>('CollectionSchema', CollectionSchemaDefinition)
