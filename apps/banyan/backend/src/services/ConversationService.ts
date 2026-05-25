/**
 * 对话会话服务
 *
 * 基于"1 App = 1 Conversation"模型，所有操作以 appId 为键。
 * 不再有多会话概念，appId 即可唯一定位会话。
 *
 * 核心职责：
 *   - 获取或创建会话（按 appId 自动创建）
 *   - 追加消息（用户消息 + AI 消息分两次写入）
 *   - 读取历史消息（注入 XiangDi LangGraph state）
 *   - 清空消息（用户点"新对话"时重置）
 *   - 删除会话（随应用一起删除）
 *
 * 消息写入策略：
 *   - 用户发送 prompt 时，立即追加 user 消息
 *   - AI 执行完成（done 事件）后，追加 assistant 消息（LLM 最终输出文本）
 *   - tool_call / tool_result 不写入 Conversation（仅用于实时 SSE 展示）
 *   - 若 AI 执行失败，不写入 assistant 消息（保持历史干净）
 */

import { Types } from 'mongoose'
import Conversation, { IConversation, IMessage, IRound } from '../models/Conversation.js'

// ─── ConversationService ──────────────────────────────────────────────────────

class ConversationService {
  /**
   * 获取或创建会话（按 appId，唯一）
   *
   * 由于 appId 是 unique 索引，直接 upsert 即可。
   * 不存在时自动创建空会话文档。
   */
  async getOrCreate(appId: string): Promise<IConversation> {
    const existing = await Conversation.findOne({ appId })
    if (existing) return existing

    const conv = new Conversation({
      appId,
      messages: [],
      messageCount: 0,
    })
    await conv.save()
    return conv
  }

  /**
   * 按 appId 获取会话（含完整消息历史）
   */
  async getByApp(appId: string): Promise<IConversation | null> {
    return Conversation.findOne({ appId })
  }

  /**
   * 追加用户消息（在 AI 执行前调用）
   *
   * 返回包含 _id 的消息对象，用于构造 threadId。
   *
   * @param appId    应用 ID
   * @param userText 用户输入的文本
   * @returns 插入的消息对象（含自动生成的 _id）
   */
  async appendUserMessage(appId: string, userText: string): Promise<{ _id: Types.ObjectId }> {
    const userMsg: IMessage = {
      role: 'user',
      content: userText,
      createdAt: new Date(),
    }

    const result = await Conversation.findOneAndUpdate(
      { appId },
      {
        $push: { messages: userMsg },
        $inc: { messageCount: 1 },
      },
      { new: true, projection: { messages: { $slice: -1 } } }
    )

    // 防御性检查：Conversation 文档可能在 getOrCreate 之后被并发删除
    if (!result || result.messages.length === 0) {
      throw new Error(`Conversation for app ${appId} not found or message insertion failed`)
    }

    // 返回刚插入的消息（含 mongoose 自动生成的 _id）
    const insertedMsg = result.messages[0]
    return { _id: insertedMsg._id! }
  }

  /**
   * 追加 AI 助手消息（在 done 事件后调用）
   *
   * @param appId          应用 ID
   * @param assistantText  AI 最终输出文本
   */
  async appendAssistantMessage(appId: string, assistantText: string): Promise<void> {
    if (!assistantText) return

    const assistantMsg: IMessage = {
      role: 'assistant',
      content: assistantText,
      createdAt: new Date(),
    }

    await Conversation.updateOne(
      { appId },
      {
        $push: { messages: assistantMsg },
        $inc: { messageCount: 1 },
      }
    )
  }

  /**
   * 获取会话的历史消息（用于注入 XiangDi LangGraph state）
   *
   * 返回格式与 XiangDi Message 类型兼容：
   *   { role: 'user' | 'assistant', content: string | ContentBlock[] }
   *
   * @param appId       应用 ID
   * @param maxMessages 最多返回的消息条数（从最新开始截取），默认 50
   */
  async getMessages(
    appId: string,
    maxMessages = 50
  ): Promise<Array<{ role: 'user' | 'assistant'; content: IMessage['content'] }>> {
    const conv = await Conversation.findOne({ appId }).select('messages')
    if (!conv || conv.messages.length === 0) return []

    // 取最新的 maxMessages 条
    const msgs = conv.messages.slice(-maxMessages)
    return msgs.map((m) => ({ role: m.role, content: m.content }))
  }

  /**
   * 追加本轮对话记录（Round）到 rounds 数组。
   *
   * 在 done 事件 + round_summary 事件均到达后调用。
   * 一轮 = user 消息（startIndex） + assistant 消息（endIndex - 1）
   *
   * @param appId        应用 ID
   * @param userPrompt   用户本轮输入（前 200 字符）
   * @param roundSummary XiangDi summarize 节点产出的整轮摘要
   * @param embedding    roundSummary 的向量嵌入（384 维），后续语义检索用
   */
  async appendRound(
    appId: string,
    userPrompt: string,
    roundSummary: string,
    embedding: number[] | null
  ): Promise<void> {
    // 读取当前 messageCount 确定索引范围
    const conv = await Conversation.findOne({ appId }).select('messageCount rounds')
    if (!conv) return

    const endIndex = conv.messageCount
    // startIndex = 本轮 user 消息的位置（至少是上一个 round 的 endIndex，或两条之前）
    const lastRound = conv.rounds.length > 0 ? conv.rounds[conv.rounds.length - 1] : null
    const startIndex = lastRound ? lastRound.endIndex : Math.max(0, endIndex - 2)

    const round: IRound = {
      startIndex,
      endIndex,
      userPrompt: userPrompt.slice(0, 200),
      roundSummary,
      embedding,
      createdAt: new Date(),
    }

    await Conversation.updateOne(
      { appId },
      { $push: { rounds: round } }
    )
  }

  /**
   * 获取所有 rounds（含 embedding），用于 ContextBuilder 按需检索
   */
  async getRounds(appId: string): Promise<IRound[]> {
    const conv = await Conversation.findOne({ appId }).select('rounds')
    if (!conv) return []
    return conv.rounds
  }

  /**
   * 根据 round 的 startIndex/endIndex 从 messages 中取出对应的完整消息
   */
  async getMessagesByRange(
    appId: string,
    startIndex: number,
    endIndex: number
  ): Promise<Array<{ role: 'user' | 'assistant'; content: IMessage['content'] }>> {
    const conv = await Conversation.findOne({ appId }).select('messages')
    if (!conv) return []
    const slice = conv.messages.slice(startIndex, endIndex)
    return slice.map((m) => ({ role: m.role, content: m.content }))
  }

  /**
   * 更新指定 message 的 threadId 和执行状态
   * @param appId    应用 ID
   * @param threadId 线程 ID（格式: appId:messageId）
   * @param status   执行状态
   */
  async updateThreadStatus(
    appId: string,
    threadId: string,
    status: 'running' | 'completed' | 'interrupted' | 'failed'
  ): Promise<void> {
    // threadId 格式为 "appId:messageId"，使用 lastIndexOf 防止 appId 含冒号时误截
    const colonIndex = threadId.lastIndexOf(':')
    const messageId = threadId.slice(colonIndex + 1)
    await Conversation.updateOne(
      { appId, 'messages._id': new Types.ObjectId(messageId) },
      { $set: { 'messages.$.threadId': threadId, 'messages.$.threadStatus': status } }
    )
  }

  /**
   * 查找最近一个未完成的 thread（running 或 interrupted 状态）
   * @param appId 应用 ID
   * @returns 未完成的 threadId 和状态，若无则返回 null
   */
  async getLastPendingThread(
    appId: string
  ): Promise<{ threadId: string; status: string } | null> {
    const conv = await Conversation.findOne(
      { appId },
      { messages: { $slice: -20 } }
    )
    if (!conv) return null

    for (let i = conv.messages.length - 1; i >= 0; i--) {
      const msg = conv.messages[i]
      if (msg.role === 'user' && msg.threadId &&
          (msg.threadStatus === 'running' || msg.threadStatus === 'interrupted')) {
        return { threadId: msg.threadId, status: msg.threadStatus }
      }
    }
    return null
  }

}

export default new ConversationService()
