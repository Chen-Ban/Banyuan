/**
 * 对话会话模型
 *
 * 一个 Conversation 对应用户与某个 App 的一次持续对话。
 * 用户关闭页面或长时间未连接后，再次打开时可从历史消息继续。
 *
 * 消息结构与 XiangDi ContextManager 的 Message 类型保持一致，
 * 以便直接反序列化后注入 ContextManager.pushMany()。
 *
 * 索引策略：
 *   - (appId, updatedAt DESC) — 按应用查最近会话
 *   - (appId, title)          — 按应用查会话列表
 *   - TTL 索引：超过 90 天未更新的会话自动清理
 */

import mongoose, { Schema, Document } from 'mongoose'

// ─── 消息类型（与 XiangDi Message 保持结构兼容）──────────────────────────────

/**
 * 单条消息内容块（文本 / 工具调用 / 工具结果 / 图片）
 * 使用 Mixed 类型存储，保持与 XiangDi 协议的完全兼容性
 */
export interface IMessageContent {
  type: string
  [key: string]: unknown
}

/**
 * 单条对话消息
 */
export interface IMessage {
  role: 'user' | 'assistant'
  /** 消息内容，可以是字符串或内容块数组 */
  content: string | IMessageContent[]
  /** 消息创建时间 */
  createdAt: Date
}

// ─── Conversation 文档接口 ────────────────────────────────────────────────────

export interface IConversation extends Document {
  /** 会话唯一 ID（业务 ID，非 MongoDB _id） */
  id: string
  /** 关联的应用 ID */
  appId: string
  /** 会话标题（默认取第一条用户消息的前 50 字） */
  title: string
  /** 完整消息历史 */
  messages: IMessage[]
  /** 消息总条数（冗余字段，避免每次 count） */
  messageCount: number
  /** 最后一条用户消息的摘要（用于列表展示） */
  lastUserMessage: string
  /**
   * 本次会话的一句话摘要（由 LLM 在 done 后异步生成）
   *
   * 用途：
   *   1. 列表页展示（比 lastUserMessage 更有语义）
   *   2. 续接其他会话时，把近期 N 条会话的 summary 拼入 memoryHint
   *      注入 XiangDi system prompt，让 Agent 感知跨会话上下文
   *
   * 生成时机：每次对话完成（done 事件）后异步触发，不阻塞主流程
   * 生成策略：调用 LLM，输入最近 10 条消息，输出 ≤ 100 字的中文摘要
   */
  summary: string
  /**
   * summary 最后生成时间
   * 用于判断是否需要重新生成（消息有更新但 summary 未更新时）
   */
  summaryUpdatedAt: Date | null
  /** 创建时间 */
  createdAt: Date
  /** 最后更新时间（有新消息时更新） */
  updatedAt: Date
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const MessageSchema = new Schema<IMessage>(
  {
    role: {
      type: String,
      enum: ['user', 'assistant'],
      required: true,
    },
    // content 可以是字符串或内容块数组，用 Mixed 存储
    content: {
      type: Schema.Types.Mixed,
      required: true,
    },
    createdAt: {
      type: Date,
      default: () => new Date(),
    },
  },
  { _id: false }
)

const ConversationSchema = new Schema<IConversation>(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    appId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    title: {
      type: String,
      default: '新对话',
      trim: true,
      maxlength: 200,
    },
    messages: {
      type: [MessageSchema],
      default: [],
    },
    messageCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastUserMessage: {
      type: String,
      default: '',
      maxlength: 500,
    },
    summary: {
      type: String,
      default: '',
      maxlength: 500,
    },
    summaryUpdatedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
)

// ─── 索引 ─────────────────────────────────────────────────────────────────────

// 按应用查最近会话（列表页主查询）
ConversationSchema.index({ appId: 1, updatedAt: -1 })

// TTL 索引：90 天未更新自动删除
ConversationSchema.index(
  { updatedAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 }
)

// ─── 模型 ─────────────────────────────────────────────────────────────────────

const Conversation = mongoose.model<IConversation>('Conversation', ConversationSchema)

export default Conversation
