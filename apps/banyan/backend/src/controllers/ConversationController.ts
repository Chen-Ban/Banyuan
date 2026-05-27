/**
 * 对话会话 Controller（V2）
 *
 * 基于"1 App = 1 Conversation"模型，提供按 appId 的对话查询接口。
 * V2 变更：返回 Dialogue[] 而非扁平 Message[]。
 */

import type { Context } from 'koa'
import conversationService from '../services/ConversationService.js'

class ConversationController {
  /**
   * GET /api/applications/:appId/conversation/dialogues
   *
   * 获取应用的对话历史（Dialogue 列表）
   *
   * Query: limit=50（最多返回的对话数，默认 50）
   */
  async getDialogues(ctx: Context): Promise<void> {
    const { appId } = ctx.params as { appId: string }
    const limit = Math.min(parseInt((ctx.query.limit as string) || '50', 10), 200)

    if (!appId) {
      ctx.status = 400
      ctx.body = { success: false, message: '缺少 appId 参数' }
      return
    }

    const dialogues = await conversationService.getDialogues(appId, limit)
    ctx.body = {
      success: true,
      data: { dialogues },
    }
  }
}

export default new ConversationController()
