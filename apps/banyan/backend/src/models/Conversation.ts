/**
 * 对话会话模型
 *
 * 一个 Application 对应一个 Conversation（1:1 关系）。
 * 以 appId 为唯一索引，无需独立的 conversationId 概念。
 *
 * 消息结构与 XiangDi Message 类型保持一致，
 * 以便直接反序列化后注入 LangGraph state.messages。
 *
 * 设计参考：Bolt / NoCode 等低代码平台的单会话模式。
 * 每个应用只有一个对话历史，打开应用即可看到完整历史。
 * 会话只追加、不删除、不清空。历史通过 round 语义检索 + 摘要拼接管理上下文窗口。
 */

import mongoose, { Schema, Document, Types } from 'mongoose'

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
  _id?: Types.ObjectId
  role: 'user' | 'assistant'
  /** 消息内容，可以是字符串或内容块数组 */
  content: string | IMessageContent[]
  /** 关联的 XiangDi 执行线程 ID（仅 user 消息有值），格式: appId:messageId */
  threadId?: string
  /**
   * 该轮 AI 执行的状态（仅 user 消息有值）
   * - running: 正在执行
   * - completed: 已完成（收到 done 事件）
   * - interrupted: 被 interrupt 暂停（等待用户输入）
   * - failed: 执行失败
   */
  threadStatus?: 'running' | 'completed' | 'interrupted' | 'failed'
  /** 消息创建时间 */
  createdAt: Date
}

// ─── Round 记录（每轮对话的结构化记录）────────────────────────────────────────

/**
 * 每一轮对话的结构化记录。
 *
 * 一轮 = 用户输入一次 + AI 完整响应一次（可能包含多次工具调用）。
 * 作为 ContextBuilder 按需检索的最小单元：
 *   - roundSummary 用于 embedding 索引和语义检索
 *   - 命中后回溯到 messages[] 中对应的完整消息作为 L4 内容
 *
 * 设计原则：
 *   - rounds[] 与 messages[] 平行存在，messages 保证完整性，rounds 保证可检索性
 *   - roundIndex 指向该轮在 messages[] 中的起始位置（用于快速定位原始消息）
 *   - embedding 在 roundSummary 生成时由 banyan 后端调用 XiangDi /ai/embed 计算
 */
export interface IRound {
  /** 该轮在 messages[] 中的起始索引（user 消息的位置） */
  startIndex: number
  /** 该轮在 messages[] 中的结束索引（exclusive，下一轮的起始或 messages.length） */
  endIndex: number
  /** 用户本轮输入摘要（取前 200 字符或完整内容） */
  userPrompt: string
  /** 本轮对话的 LLM 生成摘要（由 XiangDi summarize 节点产出） */
  roundSummary: string
  /** roundSummary 的向量嵌入（384 维，multilingual-e5-small） */
  embedding: number[] | null
  /** 该轮的创建时间 */
  createdAt: Date
}

// ─── Conversation 文档接口 ────────────────────────────────────────────────────

export interface IConversation extends Document {
  /** 关联的应用 ID（唯一索引，1 App = 1 Conversation） */
  appId: string
  /** 完整消息历史（线性增长，只追加） */
  messages: IMessage[]
  /** 消息总条数（冗余字段，避免每次 count） */
  messageCount: number
  /** 轮次记录（与 messages 平行，每轮一个条目，用于语义检索） */
  rounds: IRound[]
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
    threadId: {
      type: String,
      default: undefined,
    },
    threadStatus: {
      type: String,
      enum: ['running', 'completed', 'interrupted', 'failed'],
      default: undefined,
    },
    createdAt: {
      type: Date,
      default: () => new Date(),
    },
  }
  // NOTE: 不设置 { _id: false }，让 mongoose 为每条消息自动生成 _id，用于构造 threadId
)

const RoundSchema = new Schema(
  {
    startIndex: { type: Number, required: true, min: 0 },
    endIndex: { type: Number, required: true, min: 0 },
    userPrompt: { type: String, default: '' },
    roundSummary: { type: String, default: '' },
    embedding: { type: [Number], default: null },
    createdAt: { type: Date, default: () => new Date() },
  },
  { _id: false }
)

const ConversationSchema = new Schema<IConversation>(
  {
    appId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
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
    rounds: {
      type: [RoundSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
)

// ─── 模型 ─────────────────────────────────────────────────────────────────────

const Conversation = mongoose.model<IConversation>('Conversation', ConversationSchema)

export default Conversation
