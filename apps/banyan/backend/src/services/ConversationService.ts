/**
 * 对话会话服务
 *
 * 负责 Conversation 的 CRUD 操作，以及消息历史的追加与读取。
 *
 * 核心职责：
 *   - 创建/获取会话（支持按 appId + conversationId 查找）
 *   - 追加消息（用户消息 + AI 消息分两次写入）
 *   - 读取历史消息（注入 XiangDi ContextManager）
 *   - 列表查询（按 appId 分页，按 updatedAt 倒序）
 *   - 删除会话
 *
 * 消息写入策略：
 *   - 用户发送 prompt 时，立即追加 user 消息
 *   - AI 执行完成（done 事件）后，追加 assistant 消息（LLM 最终输出）
 *   - tool_call / tool_result 不写入 Conversation（仅用于实时 SSE 展示）
 *   - 若 AI 执行失败，不写入 assistant 消息（保持历史干净）
 */

import crypto from 'node:crypto'
import Conversation, { IConversation, IMessage } from '../models/Conversation.js'

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

export interface ConversationListItem {
  id: string
  appId: string
  title: string
  lastUserMessage: string
  /** LLM 生成的一句话摘要，可能为空（尚未生成） */
  summary: string
  messageCount: number
  createdAt: Date
  updatedAt: Date
}

export interface ConversationDetail {
  id: string
  appId: string
  title: string
  messages: IMessage[]
  messageCount: number
  createdAt: Date
  updatedAt: Date
}

export interface AppendMessagesOptions {
  /** 用户消息（prompt 文本） */
  userMessage: string
  /** AI 最终输出（done 事件后写入，可选） */
  assistantMessage?: string
}

// ─── ConversationService ──────────────────────────────────────────────────────

class ConversationService {
  /**
   * 获取或创建会话
   *
   * - 若 conversationId 存在且属于该 appId，直接返回
   * - 否则创建新会话
   *
   * @param appId          应用 ID
   * @param conversationId 可选，已有会话 ID
   * @returns 会话文档
   */
  async getOrCreate(appId: string, conversationId?: string): Promise<IConversation> {
    if (conversationId) {
      const existing = await Conversation.findOne({ id: conversationId, appId })
      if (existing) return existing
    }

    // 创建新会话
    const newId = crypto.randomUUID()
    const conv = new Conversation({
      id: newId,
      appId,
      title: '新对话',
      messages: [],
      messageCount: 0,
      lastUserMessage: '',
    })
    await conv.save()
    return conv
  }

  /**
   * 按 ID 获取会话详情（含完整消息历史）
   */
  async getById(conversationId: string): Promise<IConversation | null> {
    return Conversation.findOne({ id: conversationId })
  }

  /**
   * 按 appId 列出会话（分页，按 updatedAt 倒序）
   *
   * @param appId  应用 ID
   * @param limit  每页条数，默认 20
   * @param offset 偏移量，默认 0
   */
  async listByApp(
    appId: string,
    limit = 20,
    offset = 0
  ): Promise<{ items: ConversationListItem[]; total: number }> {
    const [items, total] = await Promise.all([
      Conversation.find({ appId })
        .sort({ updatedAt: -1 })
        .skip(offset)
        .limit(limit)
        .select('id appId title lastUserMessage summary messageCount createdAt updatedAt')
        .lean(),
      Conversation.countDocuments({ appId }),
    ])

    return {
      items: items.map((doc) => ({
        id: doc.id as string,
        appId: doc.appId as string,
        title: doc.title as string,
        lastUserMessage: doc.lastUserMessage as string,
        summary: (doc.summary as string) ?? '',
        messageCount: doc.messageCount as number,
        createdAt: doc.createdAt as Date,
        updatedAt: doc.updatedAt as Date,
      })),
      total,
    }
  }

  /**
   * 追加用户消息（在 AI 执行前调用）
   *
   * 同时更新 title（若是第一条消息）和 lastUserMessage。
   *
   * @param conversationId 会话 ID
   * @param userText       用户输入的文本
   */
  async appendUserMessage(conversationId: string, userText: string): Promise<void> {
    const userMsg: IMessage = {
      role: 'user',
      content: userText,
      createdAt: new Date(),
    }

    const truncated = userText.slice(0, 500)
    const titleUpdate = userText.slice(0, 50)

    await Conversation.updateOne(
      { id: conversationId },
      {
        $push: { messages: userMsg },
        $inc: { messageCount: 1 },
        $set: { lastUserMessage: truncated },
        // 仅在 title 为默认值时更新（避免覆盖用户自定义标题）
        $setOnInsert: {},
      }
    )

    // 若是第一条消息，更新标题
    const conv = await Conversation.findOne({ id: conversationId }).select('messageCount title')
    if (conv && conv.messageCount <= 1 && conv.title === '新对话') {
      await Conversation.updateOne(
        { id: conversationId },
        { $set: { title: titleUpdate || '新对话' } }
      )
    }
  }

  /**
   * 追加 AI 助手消息（在 done 事件后调用）
   *
   * @param conversationId  会话 ID
   * @param assistantText   AI 最终输出文本
   */
  async appendAssistantMessage(conversationId: string, assistantText: string): Promise<void> {
    if (!assistantText) return

    const assistantMsg: IMessage = {
      role: 'assistant',
      content: assistantText,
      createdAt: new Date(),
    }

    await Conversation.updateOne(
      { id: conversationId },
      {
        $push: { messages: assistantMsg },
        $inc: { messageCount: 1 },
      }
    )
  }

  /**
   * 获取会话的历史消息（用于注入 XiangDi ContextManager）
   *
   * 返回格式与 XiangDi Message 类型兼容：
   *   { role: 'user' | 'assistant', content: string | ContentBlock[] }
   *
   * @param conversationId 会话 ID
   * @param maxMessages    最多返回的消息条数（从最新开始截取），默认 50
   */
  async getMessages(
    conversationId: string,
    maxMessages = 50
  ): Promise<Array<{ role: 'user' | 'assistant'; content: IMessage['content'] }>> {
    const conv = await Conversation.findOne({ id: conversationId }).select('messages')
    if (!conv || conv.messages.length === 0) return []

    // 取最新的 maxMessages 条
    const msgs = conv.messages.slice(-maxMessages)
    return msgs.map((m) => ({ role: m.role, content: m.content }))
  }

  /**
   * 删除会话
   */
  async delete(conversationId: string): Promise<boolean> {
    const result = await Conversation.deleteOne({ id: conversationId })
    return result.deletedCount > 0
  }

  /**
   * 删除某个应用的所有会话
   */
  async deleteByApp(appId: string): Promise<number> {
    const result = await Conversation.deleteMany({ appId })
    return result.deletedCount
  }

  /**
   * 更新会话标题
   */
  async updateTitle(conversationId: string, title: string): Promise<boolean> {
    const result = await Conversation.updateOne(
      { id: conversationId },
      { $set: { title: title.slice(0, 200) } }
    )
    return result.modifiedCount > 0
  }

  /**
   * 保存 LLM 生成的会话摘要
   *
   * 由 SummaryService 在 done 事件后异步调用，不阻塞主流程。
   *
   * @param conversationId 会话 ID
   * @param summary        LLM 生成的摘要文本（≤ 100 字）
   */
  async saveSummary(conversationId: string, summary: string): Promise<void> {
    await Conversation.updateOne(
      { id: conversationId },
      {
        $set: {
          summary: summary.slice(0, 500),
          summaryUpdatedAt: new Date(),
        },
      }
    )
  }

  /**
   * 获取某个应用最近 N 条已有摘要的会话，用于拼入 memoryHint
   *
   * 返回格式：`[{ title, summary, updatedAt }]`，按 updatedAt 倒序。
   * 调用方（AiService）将其格式化为自然语言后注入 XiangDi system prompt。
   *
   * @param appId          应用 ID
   * @param excludeId      排除当前会话（避免自引用）
   * @param limit          最多返回条数，默认 5
   */
  async getSummariesForContext(
    appId: string,
    excludeId: string,
    limit = 5
  ): Promise<Array<{ title: string; summary: string; updatedAt: Date }>> {
    const docs = await Conversation.find({
      appId,
      id: { $ne: excludeId },
      summary: { $ne: '' },
    })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .select('title summary updatedAt')
      .lean()

    return docs.map((doc) => ({
      title: doc.title as string,
      summary: doc.summary as string,
      updatedAt: doc.updatedAt as Date,
    }))
  }
}

export default new ConversationService()
