/**
 * 对话会话服务（V2）
 *
 * 基于"1 App = 1 Conversation"模型，所有操作以 appId 为键。
 *
 * 核心变更（相对 V1）：
 *   - 操作单元从 message 变为 dialogue（对话）
 *   - 创建对话时指定类型（chat/task）和 threadId
 *   - 消息追加到当前活跃的 dialogue 内
 *   - threadId/threadStatus 挂载到 dialogue 级别
 *   - summary/embedding 是对整个对话的总结
 *
 * 核心职责：
 *   - 获取或创建会话（按 appId 自动创建）
 *   - 创建新对话（Dialogue）
 *   - 在对话内追加消息（用户消息 + AI 消息）
 *   - 更新对话状态（threadStatus）
 *   - 读取对话历史（用于前端展示和上下文构建）
 *   - 持久化对话摘要（summary + embedding）
 */

import { Types } from 'mongoose'
import Conversation, {
  type IConversation,
  type IDialogue,
  type IMessage,
  type IUserContent,
  type IAssistantContent,
  type DialogueType,
  type ThreadStatus,
} from '../models/Conversation.js'

// ─── ConversationService ──────────────────────────────────────────────────────

class ConversationService {
  /**
   * 获取或创建会话（按 appId，唯一）
   */
  async getOrCreate(appId: string): Promise<IConversation> {
    const existing = await Conversation.findOne({ appId })
    if (existing) return existing

    const conv = new Conversation({
      appId,
      dialogues: [],
    })
    await conv.save()
    return conv
  }

  /**
   * 按 appId 获取会话
   */
  async getByApp(appId: string): Promise<IConversation | null> {
    return Conversation.findOne({ appId })
  }

  // ─── 对话（Dialogue）操作 ──────────────────────────────────────────────────

  /**
   * 创建新对话并追加第一条用户消息
   *
   * @param appId       应用 ID
   * @param type        对话类型（chat/task）
   * @param userContent 用户消息内容
   * @returns 新创建的 dialogue（含 _id）和 user message（含 _id）
   */
  async createDialogue(
    appId: string,
    type: DialogueType,
    userContent: IUserContent
  ): Promise<{ dialogueId: Types.ObjectId; messageId: Types.ObjectId }> {
    const now = new Date()

    const userMessage: IMessage = {
      role: 'user',
      userContent,
      createdAt: now,
    }

    const dialogue: IDialogue = {
      type,
      messages: [userMessage],
      createdAt: now,
      updatedAt: now,
    }

    const result = await Conversation.findOneAndUpdate(
      { appId },
      { $push: { dialogues: dialogue } },
      { new: true, projection: { dialogues: { $slice: -1 } } }
    )

    if (!result || result.dialogues.length === 0) {
      throw new Error(`Conversation for app ${appId} not found or dialogue creation failed`)
    }

    const createdDialogue = result.dialogues[0]
    const createdMessage = createdDialogue.messages[0]

    return {
      dialogueId: createdDialogue._id!,
      messageId: createdMessage._id!,
    }
  }

  /**
   * 在现有对话内追加用户消息（用于 interrupted 后用户回复）
   *
   * @param appId       应用 ID
   * @param dialogueId  对话 ID
   * @param userContent 用户消息内容
   * @returns 新消息的 _id
   */
  async appendUserMessage(
    appId: string,
    dialogueId: Types.ObjectId,
    userContent: IUserContent
  ): Promise<Types.ObjectId> {
    const now = new Date()

    const userMessage: IMessage = {
      role: 'user',
      userContent,
      createdAt: now,
    }

    const result = await Conversation.findOneAndUpdate(
      { appId, 'dialogues._id': dialogueId },
      {
        $push: { 'dialogues.$.messages': userMessage },
        $set: { 'dialogues.$.updatedAt': now },
      },
      { new: true, projection: { 'dialogues.$': 1 } }
    )

    if (!result || result.dialogues.length === 0) {
      throw new Error(`Dialogue ${dialogueId} not found in app ${appId}`)
    }

    const messages = result.dialogues[0].messages
    const lastMessage = messages[messages.length - 1]
    return lastMessage._id!
  }

  /**
   * 在现有对话内追加助手消息
   *
   * @param appId            应用 ID
   * @param dialogueId       对话 ID
   * @param assistantContent 助手消息内容块列表
   */
  async appendAssistantMessage(
    appId: string,
    dialogueId: Types.ObjectId,
    assistantContent: IAssistantContent[]
  ): Promise<void> {
    if (!assistantContent || assistantContent.length === 0) return

    const now = new Date()

    const assistantMessage: IMessage = {
      role: 'assistant',
      assistantContent,
      createdAt: now,
    }

    await Conversation.updateOne(
      { appId, 'dialogues._id': dialogueId },
      {
        $push: { 'dialogues.$.messages': assistantMessage },
        $set: { 'dialogues.$.updatedAt': now },
      }
    )
  }

  // ─── 对话状态管理 ──────────────────────────────────────────────────────────

  /**
   * 设置对话的 threadId 和执行状态
   */
  async setThreadInfo(
    appId: string,
    dialogueId: Types.ObjectId,
    threadId: string,
    status: ThreadStatus
  ): Promise<void> {
    await Conversation.updateOne(
      { appId, 'dialogues._id': dialogueId },
      {
        $set: {
          'dialogues.$.threadId': threadId,
          'dialogues.$.threadStatus': status,
        },
      }
    )
  }

  /**
   * 更新对话的执行状态
   */
  async updateThreadStatus(
    appId: string,
    dialogueId: Types.ObjectId,
    status: ThreadStatus
  ): Promise<void> {
    await Conversation.updateOne(
      { appId, 'dialogues._id': dialogueId },
      { $set: { 'dialogues.$.threadStatus': status } }
    )
  }

  /**
   * 查找最近一个未完成的对话（running 或 interrupted 状态）
   */
  async getLastPendingDialogue(
    appId: string
  ): Promise<{ dialogueId: Types.ObjectId; threadId: string; status: ThreadStatus } | null> {
    const conv = await Conversation.findOne({ appId }).select('dialogues')
    if (!conv || conv.dialogues.length === 0) return null

    // 从最新的对话往前找
    for (let i = conv.dialogues.length - 1; i >= 0; i--) {
      const dialogue = conv.dialogues[i]
      if (
        dialogue.threadId &&
        (dialogue.threadStatus === 'running' || dialogue.threadStatus === 'interrupted')
      ) {
        return {
          dialogueId: dialogue._id!,
          threadId: dialogue.threadId,
          status: dialogue.threadStatus,
        }
      }
    }
    return null
  }

  // ─── 对话摘要 ──────────────────────────────────────────────────────────────

  /**
   * 持久化对话摘要和向量嵌入
   */
  async setSummary(
    appId: string,
    dialogueId: Types.ObjectId,
    summary: string,
    embedding: number[] | null
  ): Promise<void> {
    await Conversation.updateOne(
      { appId, 'dialogues._id': dialogueId },
      {
        $set: {
          'dialogues.$.summary': summary,
          'dialogues.$.embedding': embedding,
        },
      }
    )
  }

  // ─── 读取接口 ──────────────────────────────────────────────────────────────

  /**
   * 获取应用的对话列表（用于前端展示）
   *
   * @param appId 应用 ID
   * @param limit 最多返回的对话数（从最新开始截取），默认 50
   */
  async getDialogues(appId: string, limit = 50): Promise<Omit<IDialogue, 'embedding'>[]> {
    const conv = await Conversation.findOne({ appId }).select('dialogues')
    if (!conv || conv.dialogues.length === 0) return []

    // 取最新的 limit 个对话，过滤掉 embedding 字段（高维向量不传给前端）
    const dialogues = conv.dialogues.slice(-limit)
    return dialogues.map(d => {
      // Mongoose subdocument → plain object（兼容 lean 查询和普通查询）
      const obj = (typeof (d as unknown as { toObject?: () => unknown }).toObject === 'function'
        ? (d as unknown as { toObject: () => Record<string, unknown> }).toObject()
        : d) as Record<string, unknown>
      const { embedding: _embedding, ...rest } = obj
      return rest as Omit<IDialogue, 'embedding'>
    })
  }

  /**
   * 获取所有对话的摘要和向量（用于 ContextBuilder 语义检索）
   */
  async getDialogueSummaries(
    appId: string
  ): Promise<Array<{ dialogueId: Types.ObjectId; summary: string; embedding: number[] | null; type: DialogueType; createdAt: Date }>> {
    const conv = await Conversation.findOne({ appId }).select('dialogues')
    if (!conv) return []

    return conv.dialogues
      .filter((d) => d.summary)
      .map((d) => ({
        dialogueId: d._id!,
        summary: d.summary!,
        embedding: d.embedding ?? null,
        type: d.type,
        createdAt: d.createdAt,
      }))
  }

  /**
   * 获取指定对话的完整消息（用于 ContextBuilder 命中后回溯）
   */
  async getDialogueMessages(
    appId: string,
    dialogueId: Types.ObjectId
  ): Promise<IMessage[]> {
    const conv = await Conversation.findOne(
      { appId, 'dialogues._id': dialogueId },
      { 'dialogues.$': 1 }
    )
    if (!conv || conv.dialogues.length === 0) return []
    return conv.dialogues[0].messages
  }

  /**
   * 获取最近 N 条对话中的消息（用于构建 recentMessages 上下文）
   * 返回扁平化的消息列表，按时间顺序
   */
  async getRecentMessages(
    appId: string,
    maxDialogues = 5
  ): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    const conv = await Conversation.findOne({ appId }).select('dialogues')
    if (!conv || conv.dialogues.length === 0) return []

    const recentDialogues = conv.dialogues.slice(-maxDialogues)
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = []

    for (const dialogue of recentDialogues) {
      for (const msg of dialogue.messages) {
        if (msg.role === 'user' && msg.userContent) {
          messages.push({ role: 'user', content: msg.userContent.prompt })
        } else if (msg.role === 'assistant' && msg.assistantContent) {
          // 提取 assistant 消息中的文本内容
          const textParts = msg.assistantContent
            .filter((c): c is { type: 'text'; text: string } & typeof c => c.type === 'text')
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
