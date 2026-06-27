/**
 * 对话会话服务（V3 — ADR-041 轻量索引容器）
 *
 * Conversation 退化为纯索引容器（appId + dialogueIds[]），
 * 所有对话内容、状态机、快照由独立 Dialogue 集合承载。
 *
 * 本 Service 的职责：
 *   - 获取或创建 Conversation（按 appId 唯一索引）
 *   - 注册 dialogueId 到 Conversation（confirm 后挂载）
 *   - 读取 Dialogue 列表（从独立集合查询，返回给前端）
 */

import { Types } from 'mongoose'
import Conversation, { type IConversationDoc } from '../models/conversation/Conversation.js'
import Dialogue from '../models/conversation/Dialogue.js'

// ─── ConversationService ──────────────────────────────────────────────────────

class ConversationService {
  /**
   * 获取或创建会话（按 appId，唯一）
   *
   * 使用 findOneAndUpdate + upsert 原子操作，避免并发下的 TOCTOU 竞态：
   * - 若 appId 对应的文档已存在，直接返回现有文档（setOnInsert 不修改已有字段）
   * - 若不存在，原子性创建并返回新文档
   * - 即使两个请求同时到达，MongoDB 唯一索引确保只创建一个文档
   */
  async getOrCreate(appId: string): Promise<IConversationDoc> {
    const conv = await Conversation.findOneAndUpdate(
      { appId },
      { $setOnInsert: { appId, dialogueIds: [] } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
    if (!conv) throw new Error(`getOrCreate 返回 null（appId=${appId}）`)
    return conv
  }

  /**
   * 按 appId 获取会话
   */
  async getByApp(appId: string): Promise<IConversationDoc | null> {
    return Conversation.findOne({ appId })
  }

  // ─── Dialogue 引用管理 ────────────────────────────────────────────────────

  /**
   * 将 dialogueId 注册到 Conversation.dialogueIds（幂等）
   *
   * 在 Dialogue 到达终态（done）后调用，将其 ID 追加到 Conversation 的引用列表。
   * 使用 $addToSet 保证幂等（重复调用不会产生重复 ID）。
   */
  async registerDialogue(appId: string, dialogueId: Types.ObjectId): Promise<void> {
    await Conversation.updateOne({ appId }, { $addToSet: { dialogueIds: dialogueId } })
  }

  // ─── 读取接口 ──────────────────────────────────────────────────────────────

  /**
   * 获取应用的对话列表（从独立 Dialogue 集合查询）
   *
   * @param appId 应用 ID
   * @param limit 最多返回的对话数（从最新开始截取），默认 50
   */
  async getDialogues(appId: string, limit = 50) {
    const dialogues = await Dialogue.find({ appId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('-embedding')
      .lean()

    // 返回时按时间正序（旧→新），前端按顺序展示
    return dialogues.reverse()
  }

  /**
   * 获取所有对话的摘要和向量（用于 ContextBuilder 语义检索）
   */
  async getDialogueSummaries(
    appId: string,
  ): Promise<
    Array<{
      dialogueId: Types.ObjectId
      summary: string
      embedding: number[] | null
      type: string
      createdAt: Date
    }>
  > {
    const dialogues = await Dialogue.find({ appId, 'summary.text': { $exists: true } })
      .select('summary type createdAt')
      .lean()

    return dialogues.map((d) => ({
      dialogueId: d._id as Types.ObjectId,
      summary: d.summary!.text,
      embedding: d.summary!.embedding ?? null,
      type: d.type,
      createdAt: d.createdAt,
    }))
  }

  /**
   * 获取最近 N 条对话中的消息（用于构建 recentMessages 上下文）
   * 返回扁平化的消息列表，按时间顺序
   */
  async getRecentMessages(
    appId: string,
    maxDialogues = 5,
  ): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    const dialogues = await Dialogue.find({ appId })
      .sort({ createdAt: -1 })
      .limit(maxDialogues)
      .select('messages')
      .lean()

    // 反转为时间正序
    dialogues.reverse()

    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = []

    for (const dialogue of dialogues) {
      for (const msg of dialogue.messages) {
        if (msg.role === 'user' && msg.userContent) {
          messages.push({ role: 'user', content: msg.userContent.prompt })
        } else if (msg.role === 'assistant' && msg.assistantContent) {
          const textParts = msg.assistantContent
            .filter((c) => c.type === 'text')
            .map((c) => (c as { type: 'text'; text: string }).text)
          if (textParts.length > 0) {
            messages.push({ role: 'assistant', content: textParts.join('') })
          }
        }
      }
    }

    return messages
  }
}

export default new ConversationService()
