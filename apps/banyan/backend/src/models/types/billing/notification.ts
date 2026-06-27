/**
 * Notification 类型定义
 */

export type NotificationType =
  | 'quota_warning'
  | 'quota_critical'
  | 'payment_success'
  | 'payment_failed'
  | 'plan_changed'
  | 'bill_ready'

export interface INotification {
  notificationId: string
  teamId: string
  /** 接收用户 ID */
  userId: string
  /** 通知类型 */
  type: NotificationType
  /** 通知标题 */
  title: string
  /** 通知内容 */
  message: string
  /** 是否已读 */
  read: boolean
  /** 附加元数据（如 remaining、total 等） */
  meta?: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}
