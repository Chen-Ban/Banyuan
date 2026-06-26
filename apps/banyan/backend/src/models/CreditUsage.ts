/**
 * CreditUsage Mongoose 模型 — 月度 credit 用量记录
 *
 * 每次 AI 对话完成后异步写入，按 tenantId + yearMonth 聚合。
 * 查询时用 findOne({ tenantId, yearMonth }) 获取当月用量。
 */

import mongoose, { Schema, Document } from 'mongoose'
import type { ICreditUsage } from './types/index.js'

type ICreditUsageDoc = ICreditUsage & Document

const CreditUsageDetailSchema = new Schema(
  {
    sessionId: { type: String, required: true },
    model: { type: String, required: true },
    inputTokens: { type: Number, required: true },
    outputTokens: { type: Number, required: true },
    credits: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false },
)

const CreditUsageSchema = new Schema<ICreditUsageDoc>(
  {
    usageId: { type: String, required: true, unique: true, index: true },
    tenantId: { type: String, required: true, index: true },
    applicationId: { type: String, default: undefined, sparse: true },
    appAiLimit: { type: Number, default: undefined },
    yearMonth: { type: String, required: true },
    creditsUsed: { type: Number, required: true, default: 0 },
    detail: { type: [CreditUsageDetailSchema], default: [] },
  },
  { timestamps: true, collection: 'credit_usage' },
)

CreditUsageSchema.index(
  { tenantId: 1, yearMonth: 1 },
  { unique: true, partialFilterExpression: { applicationId: { $exists: false } } },
)
CreditUsageSchema.index(
  { tenantId: 1, applicationId: 1, yearMonth: 1 },
  { unique: true, partialFilterExpression: { applicationId: { $type: 'string' } } },
)

export const CreditUsage = mongoose.model<ICreditUsageDoc>('CreditUsage', CreditUsageSchema)
