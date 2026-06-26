/**
 * Notification Mongoose 模型 — 用户通知
 *
 * 用于系统主动推送通知（配额告警、支付结果、账单提醒等）。
 * 通知与租户 + 用户关联，支持标记已读。
 */

import mongoose, { Schema, Document } from 'mongoose'
import type { INotification } from './types/index.js'

type INotificationDoc = INotification & Document

const NotificationSchema = new Schema<INotificationDoc>(
  {
    notificationId: { type: String, required: true, unique: true, index: true },
    tenantId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: [
        'quota_warning',
        'quota_critical',
        'payment_success',
        'payment_failed',
        'plan_changed',
        'bill_ready',
      ],
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: 'notifications' },
)

NotificationSchema.index({ tenantId: 1, userId: 1, createdAt: -1 })

export const Notification = mongoose.model<INotificationDoc>('Notification', NotificationSchema)
