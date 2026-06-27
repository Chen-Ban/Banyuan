/**
 * PaymentOrder Mongoose 模型 — 聚合支付订单
 *
 * 通过聚合服务商统一对接支付宝/微信支付。
 * 订单创建后返回支付链接（当前为聚合商占位 mock URL），
 * 支付完成后通过 notify 回调更新订单状态并激活套餐。
 */

import mongoose, { Schema, Document } from 'mongoose'
import type { IPaymentOrder } from '../types/index.js'

type IPaymentOrderDoc = IPaymentOrder & Document

const PaymentOrderSchema = new Schema<IPaymentOrderDoc>(
  {
    orderId: { type: String, required: true, unique: true },
    teamId: { type: String, required: true, index: true },
    planId: { type: String, required: true },
    amount: { type: Number, required: true },
    channel: { type: String, enum: ['alipay', 'wechat', 'aggregator'], required: true },
    status: {
      type: String,
      enum: ['pending', 'paid', 'expired', 'refunded'],
      default: 'pending',
    },
    outTradeNo: { type: String, required: true, unique: true },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'payment_orders' },
)

export const PaymentOrder = mongoose.model<IPaymentOrderDoc>('PaymentOrder', PaymentOrderSchema)
