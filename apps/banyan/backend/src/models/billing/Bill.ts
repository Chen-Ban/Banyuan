/**
 * Bill Mongoose 模型 — 月度账单
 *
 * 每月 1 日由 BillingService 定时任务自动生成。
 * 账单生成后状态为 'pending'，支付完成后更新为 'paid'，
 * 逾期未支付更新为 'overdue'。
 */

import mongoose, { Schema, Document } from 'mongoose'
import type { IBill } from '../types/index.js'

type IBillDoc = IBill & Document

const BillSchema = new Schema<IBillDoc>(
  {
    billId: { type: String, required: true, unique: true },
    teamId: { type: String, required: true, index: true },
    yearMonth: { type: String, required: true },
    basePrice: { type: Number, required: true, default: 0 },
    overageCredits: { type: Number, required: true, default: 0 },
    overagePrice: { type: Number, required: true, default: 0 },
    totalPrice: { type: Number, required: true, default: 0 },
    status: {
      type: String,
      enum: ['pending', 'paid', 'overdue'],
      default: 'pending',
    },
  },
  { timestamps: true, collection: 'bills' },
)

BillSchema.index({ teamId: 1, yearMonth: 1 }, { unique: true })

export const Bill = mongoose.model<IBillDoc>('Bill', BillSchema)
