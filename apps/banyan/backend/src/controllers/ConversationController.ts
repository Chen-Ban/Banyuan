/**
 * 对话会话 Controller
 *
 * 基于"1 App = 1 Conversation"模型，提供按 appId 的消息查询接口。
 * 会话只增不删，创建和消息追加由 AiService 在对话过程中自动完成。
 */

import type { Context } from 'koa'
import conversationService from '../services/ConversationService.js'

class ConversationController {
  /**
   * GET /api/applications/:appId/conversation/messages
   *
   * 获取应用的对话历史消息
   *
   * Query: limit=50（最多返回条数，默认 50）
   */
  async getMessages(ctx: Context): Promise<void> {
    const { appId } = ctx.params as { appId: string }
    const limit = Math.min(parseInt((ctx.query.limit as string) || '50', 10), 200)

    if (!appId) {
      ctx.status = 400
      ctx.body = { success: false, message: '缺少 appId 参数' }
      return
    }

    const messages = await conversationService.getMessages(appId, limit)
    ctx.body = {
      success: true,
      data: { messages },
    }
  }
}

export default new ConversationController()
