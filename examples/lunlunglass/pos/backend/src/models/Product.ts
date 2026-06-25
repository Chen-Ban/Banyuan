import mongoose, { Schema, Document } from 'mongoose'

/**
 * 产品文档接口
 */
export interface IProduct extends Document {
  /** 产品名称 */
  name: string
  /** 产品编码或SKU */
  sku?: string
  /** 单价（元） */
  unitPrice: number
  /** 产品描述 */
  description?: string
  /** 产品封面图 */
  imageUrl?: string
  /** 库存数量 */
  stock?: number
  /** 规格/型号 */
  spec?: string
  /** 创建时间 */
  createdAt: Date
  /** 更新时间 */
  updatedAt: Date
}

/**
 * 产品 Schema
 */
const ProductSchema = new Schema<IProduct>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    sku: {
      type: String,
      trim: true,
      unique: true,
      sparse: true, // 允许 null 值，但如果有值则必须唯一
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    imageUrl: {
      type: String,
      trim: true,
    },
    stock: {
      type: Number,
      min: 0,
      default: 0,
    },
    spec: {
      type: String,
      trim: true,
      maxlength: 100,
    },
  },
  {
    timestamps: true, // 自动添加 createdAt 和 updatedAt
  },
)

// 创建索引
ProductSchema.index({ name: 1 })
ProductSchema.index({ sku: 1 })
ProductSchema.index({ unitPrice: 1 })

/**
 * 产品模型
 */
const Product = mongoose.model<IProduct>('Product', ProductSchema)

export default Product
