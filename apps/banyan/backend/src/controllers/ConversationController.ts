/**
 * 对话会话 Controller（V3 — 事务化）
 *
 * 基于"1 App = 1 Conversation"模型，提供按 appId 的对话查询接口。
 * V3 变更：getDialogues 返回时额外附带 pendingDialogue 信息，
 *          前端可据此显示"确认/撤销"交互。
 */

import type { Context } from 'koa'
import conversationService from '../services/ConversationService.js'
import aiService from '../services/AiService.js'

class ConversationController {
  /**
   * GET /api/applications/:appId/conversation/dialogues
   *
   * 获取应用的对话历史（Dialogue 列表）
   *
   * Query: limit=50（最多返回的对话数，默认 50）
   *
   * 响应体新增字段 pendingDialogue（V3）：
   *   - null: 无 pending 对话
   *   - { dialogueId, type, status, userContent, assistantContent, createdAt }:
   *     有未确认的对话，前端应显示确认/撤销按钮
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

    // 查询是否有 pending 对话（task 模式未 confirm/discard）
    const pending = aiService.getPendingDialogue(appId)
    const pendingDialogue = pending
      ? {
          dialogueId: pending.dialogueId,
          type: pending.type,
          status: pending.status,
          userMessage: pending.userMessage,
          assistantContent: pending.assistantContent,
          createdAt: pending.createdAt,
        }
      : null

    ctx.body = {
      success: true,
      data: { dialogues, pendingDialogue },
    }
  }
}

export default new ConversationController()
