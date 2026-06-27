/**
 * 通知路由 — 用户通知查询 & 标记已读
 */

import Router from '@koa/router'
import { notificationService } from '../services/NotificationService.js'
import { logger } from '../utils/logger.js'

const notificationRouter = new Router({ prefix: '/api/notifications' })

/**
 * GET /api/notifications
 * 查询当前用户的通知列表
 * Query: ?unread=true 仅查询未读
 */
notificationRouter.get('/', async (ctx) => {
  const user = ctx.state.user
  if (!user) {
    ctx.status = 401
    ctx.body = { success: false, message: '未认证' }
    return
  }

  if (!user.teamId) {
    ctx.status = 403
    ctx.body = { success: false, message: '请先创建或加入一个团队' }
    return
  }

  try {
    const unreadOnly = ctx.query.unread === 'true'
    const notifications = await notificationService.listByUser(
      user.teamId,
      user.userId,
      unreadOnly,
    )
    ctx.body = { success: true, data: notifications }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`Failed to list notifications: ${message}`)
    ctx.status = 500
    ctx.body = { success: false, message: '查询通知失败' }
  }
})

/**
 * POST /api/notifications/:id/read
 * 标记指定通知为已读（仅允许标记本人通知）
 */
notificationRouter.post('/:id/read', async (ctx) => {
  const user = ctx.state.user
  if (!user) {
    ctx.status = 401
    ctx.body = { success: false, message: '未认证' }
    return
  }

  if (!user.teamId) {
    ctx.status = 403
    ctx.body = { success: false, message: '请先创建或加入一个团队' }
    return
  }

  const { id } = ctx.params
  const updated = await notificationService.markAsRead(id, user.teamId, user.userId)

  if (!updated) {
    ctx.status = 404
    ctx.body = { success: false, message: '通知不存在或无权限' }
    return
  }

  ctx.body = { success: true, message: '已标记为已读' }
})

export default notificationRouter
