import mongoose, { Schema, Document, Types } from 'mongoose'
import { IProduct } from './Product'

/**
 * 订单项（订单中的单个商品项）
 */
export interface IOrderItem {
  /** 商品ID（引用 Product） */
  productId: Types.ObjectId
  /** 商品信息快照（保存订单时的商品信息） */
  product: {
    id: string
    name: string
    sku?: string
    unitPrice: number
    spec?: string
  }
  /** 数量 */
  quantity: number
  /** 单价（订单中的价格，可能与商品当前单价不同） */
  price: number
  /** 小计金额 */
  subtotal: number
}

/**
 * 订单状态枚举
 */
export enum OrderStatus {
  PENDING = 'pending',      // 待处理
  PROCESSING = 'processing', // 处理中
  COMPLETED = 'completed',  // 已完成
  CANCELLED = 'cancelled',  // 已取消
}

/**
 * 订单文档接口
 */
export interface IOrder extends Document {
  /** 订单业务编号 */
  orderId: string
  /** 用户ID（引用 User） */
  userId: Types.ObjectId
  /** 用户业务ID（冗余字段，方便查询） */
  userUserId: string
  /** 用户名（冗余字段，方便查询） */
  username: string
  /** 订单项列表 */
  items: IOrderItem[]
  /** 订单总金额 */
  totalAmount: number
  /** 订单状态 */
  status: OrderStatus
  /** 备注 */
  remark?: string
  /** 创建时间 */
  createdAt: Date
  /** 更新时间 */
  updatedAt: Date
}

/**
 * 订单项 Schema
 */
const OrderItemSchema = new Schema<IOrderItem>({
  productId: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  product: {
    id: { type: String, required: true },
    name: { type: String, required: true },
    sku: { type: String },
    unitPrice: { type: Number, required: true },
    spec: { type: String },
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  subtotal: {
    type: Number,
    required: true,
    min: 0,
  },
}, { _id: false })

/**
 * 订单 Schema
 */
const OrderSchema = new Schema<IOrder>(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    userUserId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    username: {
      type: String,
      required: true,
      trim: true,
    },
    items: {
      type: [OrderItemSchema],
      required: true,
      validate: {
        validator: (items: IOrderItem[]) => items.length > 0,
        message: 'Order must have at least one item',
      },
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: Object.values(OrderStatus),
      default: OrderStatus.PENDING,
      index: true,
    },
    remark: {
      type: String,
      trim: true,
      maxlength: 500,
    },
  },
  {
    timestamps: true, // 自动添加 createdAt 和 updatedAt
  }
)

// 创建索引
OrderSchema.index({ orderId: 1 })
OrderSchema.index({ userId: 1 })
OrderSchema.index({ userUserId: 1 })
OrderSchema.index({ username: 1 })
OrderSchema.index({ status: 1 })
OrderSchema.index({ createdAt: -1 })

/**
 * 订单模型
 */
const Order = mongoose.model<IOrder>('Order', OrderSchema)

export default Order

