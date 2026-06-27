/**
 * NotificationService — 用户通知管理
 *
 * 职责：
 *   - 创建通知（配额告警、支付结果、账单提醒等）
 *   - 标记已读
 *   - 查询用户通知列表
 */

import crypto from 'crypto'
import { Notification } from '../models/billing/Notification.js'
import { logger } from '../utils/logger.js'
import type { NotificationType } from '../models/types/index.js'
import { Membership } from '../models/index.js'

function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

export class NotificationService {
  /**
   * 创建一条通知
   */
  async create(
    teamId: string,
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    meta?: Record<string, unknown>,
  ): Promise<string> {
    try {
      const notificationId = generateId('notif')
      await Notification.create({
        notificationId,
        teamId,
        userId,
        type,
        title,
        message,
        read: false,
        meta: meta ?? {},
      })
      logger.info(
        { notificationId, teamId, userId, type },
        `Notification created: ${type}`,
      )
      return notificationId
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      logger.error({ teamId, userId, type, error: errorMsg }, 'Failed to create notification')
      throw err
    }
  }

  /**
   * 标记通知为已读（校验通知归属）
   */
  async markAsRead(notificationId: string, teamId: string, userId: string): Promise<boolean> {
    const result = await Notification.findOneAndUpdate(
      { notificationId, teamId, userId },
      { $set: { read: true } },
      { new: true },
    )
    if (!result) {
      return false
    }
    return true
  }

  /**
   * 查询用户通知列表
   */
  async listByUser(
    teamId: string,
    userId: string,
    unreadOnly?: boolean,
  ): Promise<Array<Record<string, unknown>>> {
    const filter: Record<string, unknown> = { teamId, userId }
    if (unreadOnly) {
      filter.read = false
    }
    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .lean()
    return notifications.map((n) => ({
      notificationId: n.notificationId,
      type: n.type,
      title: n.title,
      message: n.message,
      read: n.read,
      meta: n.meta,
      createdAt: n.createdAt,
    }))
  }

  /**
   * 发送配额告警通知（便捷方法）
   * @param teamId 团队 ID
   * @param level 告警级别：'warning' | 'critical'
   * @param remaining 剩余 credits
   * @param total 总 credits
   */
  async sendQuotaAlert(
    teamId: string,
    level: 'warning' | 'critical',
    remaining: number,
    total: number,
  ): Promise<void> {
    const type: NotificationType = level === 'critical' ? 'quota_critical' : 'quota_warning'
    const percentage = total > 0 ? Math.round((remaining / total) * 100) : 0
    const title = level === 'critical'
      ? '⚠️ 配额即将耗尽'
      : '📊 配额使用提醒'
    const message = level === 'critical'
      ? `您的月配额仅剩 ${percentage}%（${remaining.toLocaleString()} / ${total.toLocaleString()} credits），请及时关注。`
      : `您已使用 ${100 - percentage}% 的月配额（剩余 ${remaining.toLocaleString()} / ${total.toLocaleString()} credits）。`

    try {
      const members = await Membership.find({ teamId }).lean()
      for (const member of members) {
        await this.create(teamId, member.userId, type, title, message, {
          remaining,
          total,
          percentage,
        })
      }
      logger.info({ teamId, level, remaining, total }, 'Quota alerts sent')
    } catch (err) {
      // 告警发送失败不抛异常，避免影响主流程
      const errorMsg = err instanceof Error ? err.message : String(err)
      logger.error({ teamId, level, error: errorMsg }, 'Failed to send quota alert')
    }
  }
}

export const notificationService = new NotificationService()
