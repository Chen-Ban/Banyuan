import mongoose, { Schema } from 'mongoose'
import type { Document } from 'mongoose'
import type { IFieldDef, ICollectionDef, ICollectionSchema } from './types/index.js'

// ── 本地文档类型别名 ───────────────────────────────────────────────────────────

type ICollectionSchemaDoc = ICollectionSchema & Document

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

const CollectionSchemaDefinition = new Schema<ICollectionSchemaDoc>(
  {
    appId: { type: String, required: true, unique: true, index: true },
    collections: { type: [CollectionDefSchema], default: [] },
    version: { type: Number, required: true, default: 1 },
  },
  { timestamps: true },
)

export default mongoose.model<ICollectionSchemaDoc>('CollectionSchema', CollectionSchemaDefinition)
