/**
 * 对话会话 Controller
 *
 * 提供会话的查询、删除、标题修改接口。
 * 会话的创建和消息追加由 AiService 在对话过程中自动完成。
 */

import type { Context } from 'koa'
import conversationService from '../services/ConversationService.js'

class ConversationController {
  /**
   * GET /api/conversations/:appId
   *
   * 列出某个应用的所有会话（按最近更新倒序）
   *
   * Query: limit=20&offset=0
   */
  async list(ctx: Context): Promise<void> {
    const { appId } = ctx.params as { appId: string }
    const limit = Math.min(parseInt((ctx.query.limit as string) || '20', 10), 100)
    const offset = Math.max(parseInt((ctx.query.offset as string) || '0', 10), 0)

    if (!appId) {
      ctx.status = 400
      ctx.body = { success: false, message: '缺少 appId 参数' }
      return
    }

    const { items, total } = await conversationService.listByApp(appId, limit, offset)
    ctx.body = {
      success: true,
      data: { items, total, limit, offset },
    }
  }

  /**
   * GET /api/conversations/:appId/:conversationId
   *
   * 获取会话详情（含完整消息历史）
   */
  async detail(ctx: Context): Promise<void> {
    const { conversationId } = ctx.params as { conversationId: string }

    const conv = await conversationService.getById(conversationId)
    if (!conv) {
      ctx.status = 404
      ctx.body = { success: false, message: '会话不存在' }
      return
    }

    ctx.body = {
      success: true,
      data: {
        id: conv.id,
        appId: conv.appId,
        title: conv.title,
        messages: conv.messages,
        messageCount: conv.messageCount,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
      },
    }
  }

  /**
   * PATCH /api/conversations/:appId/:conversationId
   *
   * 更新会话标题
   * Body: { title: string }
   */
  async updateTitle(ctx: Context): Promise<void> {
    const { conversationId } = ctx.params as { conversationId: string }
    const body = ctx.request.body as { title?: string }
    const title = body?.title?.trim()

    if (!title) {
      ctx.status = 400
      ctx.body = { success: false, message: '缺少 title 参数' }
      return
    }

    const updated = await conversationService.updateTitle(conversationId, title)
    if (!updated) {
      ctx.status = 404
      ctx.body = { success: false, message: '会话不存在' }
      return
    }

    ctx.body = { success: true }
  }

  /**
   * DELETE /api/conversations/:appId/:conversationId
   *
   * 删除单个会话
   */
  async delete(ctx: Context): Promise<void> {
    const { conversationId } = ctx.params as { conversationId: string }

    const deleted = await conversationService.delete(conversationId)
    if (!deleted) {
      ctx.status = 404
      ctx.body = { success: false, message: '会话不存在' }
      return
    }

    ctx.body = { success: true }
  }

  /**
   * DELETE /api/conversations/:appId
   *
   * 删除某个应用的所有会话
   */
  async deleteByApp(ctx: Context): Promise<void> {
    const { appId } = ctx.params as { appId: string }

    if (!appId) {
      ctx.status = 400
      ctx.body = { success: false, message: '缺少 appId 参数' }
      return
    }

    const count = await conversationService.deleteByApp(appId)
    ctx.body = { success: true, data: { deletedCount: count } }
  }
}

export default new ConversationController()
