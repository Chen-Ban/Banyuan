/**
 * Plan Mongoose 模型 — 套餐定义
 *
 * 种子数据在 seeds/seedPlans.ts 中初始化。
 * 运行时通过管理后台热更新，无需重启服务。
 */

import mongoose, { Schema, Document } from 'mongoose'
import type { IPlan } from '../types/index.js'

type IPlanDoc = IPlan & Document

const PlanSchema = new Schema<IPlanDoc>(
  {
    planId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    monthlyCredits: { type: Number, required: true, default: 0 },
    priceInCents: { type: Number, required: true, default: 0 },
    permissions: { type: [String], default: [] },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'plans' },
)

export const Plan = mongoose.model<IPlanDoc>('Plan', PlanSchema)
