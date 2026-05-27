/**
 * 对话会话模型（V2）
 *
 * 一个 Application 对应一个 Conversation（1:1 关系）。
 * 以 appId 为唯一索引，无需独立的 conversationId 概念。
 *
 * 核心变更（相对 V1）：
 *   - 引入 Dialogue（对话）作为核心聚合单元，替代旧的 messages[] + rounds[]
 *   - Dialogue 按语义分为 chat（纯聊天）和 task（做任务）两种类型
 *   - 消息按角色区分内容结构：UserContent / AssistantContent
 *   - AssistantContent 完整保留 SSE 实时进度（解决历史消息与实时消息断层问题）
 *   - threadId / threadStatus 挂载到 Dialogue 级别（一次对话可能多次中断恢复）
 *   - summary 是对整个对话的总结（而非一段消息的摘要）
 *   - Snapshot 独立集合存储，通过 dialogueId 关联（避免文档膨胀）
 *
 * 设计参考：Bolt / NoCode 等低代码平台的单会话模式。
 * 每个应用只有一个对话历史，打开应用即可看到完整历史。
 */

import mongoose, { Schema, Document, Types } from 'mongoose'

// ─── 枚举类型 ─────────────────────────────────────────────────────────────────

/** 对话类型 */
export type DialogueType = 'chat' | 'task'

/** 对话执行状态 */
export type ThreadStatus = 'running' | 'completed' | 'interrupted' | 'failed'

/** 助手消息内容块类型 */
export type AssistantContentType =
  | 'text'
  | 'tool_call'
  | 'tool_result'
  | 'pages_snapshot'
  | 'schema_update'
  | 'disambiguation'
  | 'done'
  | 'error'

// ─── 用户消息内容 ─────────────────────────────────────────────────────────────

/** 图片项 */
export interface IImageItem {
  /** 图片地址 */
  url: string
  /** 图片描述（可选） */
  alt?: string
}

/** 用户消息内容（结构化） */
export interface IUserContent {
  /** 用户文字输入 */
  prompt: string
  /** 用户上传的图片列表 */
  images: IImageItem[]
}

// ─── 助手消息内容块（Discriminated Union） ────────────────────────────────────

/** 助手消息内容块基础接口 */
export interface IAssistantContentBase {
  type: AssistantContentType
}

/** LLM 文字输出（完整文本，非 delta） */
export interface ITextContent extends IAssistantContentBase {
  type: 'text'
  text: string
}

/** 工具调用 */
export interface IToolCallContent extends IAssistantContentBase {
  type: 'tool_call'
  id: string
  name: string
  input: unknown
}

/** 工具执行结果 */
export interface IToolResultContent extends IAssistantContentBase {
  type: 'tool_result'
  id: string
  result: unknown
  isError: boolean
}

/** 画布快照 */
export interface IPagesSnapshotContent extends IAssistantContentBase {
  type: 'pages_snapshot'
  pages: string[]
}

/** Schema 更新 */
export interface ISchemaUpdateContent extends IAssistantContentBase {
  type: 'schema_update'
  collections: unknown[]
}

/** 消歧事件（含用户最终选择） */
export interface IDisambiguationContent extends IAssistantContentBase {
  type: 'disambiguation'
  options: unknown
  /** 用户最终选择的 choiceId */
  choiceId?: string
}

/** 完成标记 */
export interface IDoneContent extends IAssistantContentBase {
  type: 'done'
  pages: string[]
}

/** 错误信息 */
export interface IErrorContent extends IAssistantContentBase {
  type: 'error'
  message: string
}

/** 助手消息内容块联合类型 */
export type IAssistantContent =
  | ITextContent
  | IToolCallContent
  | IToolResultContent
  | IPagesSnapshotContent
  | ISchemaUpdateContent
  | IDisambiguationContent
  | IDoneContent
  | IErrorContent

// ─── 消息 ─────────────────────────────────────────────────────────────────────

/** 单条消息 */
export interface IMessage {
  _id?: Types.ObjectId
  /** 消息角色 */
  role: 'user' | 'assistant'
  /** 用户消息内容（仅 role=user 时有值） */
  userContent?: IUserContent
  /** 助手消息内容块列表（仅 role=assistant 时有值） */
  assistantContent?: IAssistantContent[]
  /** 消息创建时间 */
  createdAt: Date
}

// ─── 对话（Dialogue） ─────────────────────────────────────────────────────────

/**
 * 对话（Dialogue）—— 核心聚合单元
 *
 * 一个对话是一次完整的用户提问 → AI 解决问题的过程。
 * 边界清晰：用户觉得改的不好又要改，那是一次新的对话。
 *
 * 对话类型：
 *   - chat: 纯聊天（问答、闲聊、咨询），AI 只回答不操作画布
 *   - task: 做任务（规划+执行是内部子步骤），AI 会修改应用状态
 *
 * 一个对话内可能有多条 user 消息（中断→用户回复→继续执行）。
 */
export interface IDialogue {
  _id?: Types.ObjectId
  /** 对话类型：chat（纯聊天）| task（做任务） */
  type: DialogueType
  /** XiangDi 执行线程 ID */
  threadId?: string
  /** 对话执行状态 */
  threadStatus?: ThreadStatus
  /** 该对话内的所有消息（按时间顺序） */
  messages: IMessage[]
  /** 对话完成后的 LLM 摘要（整个对话的总结） */
  summary?: string
  /** summary 的向量嵌入（384 维，multilingual-e5-small） */
  embedding?: number[] | null
  /** 对话开始时间 */
  createdAt: Date
  /** 最后一条消息的时间 */
  updatedAt: Date
}

// ─── Conversation 文档接口 ────────────────────────────────────────────────────

export interface IConversation extends Document {
  /** 关联的应用 ID（唯一索引，1 App = 1 Conversation） */
  appId: string
  /** 按时间顺序排列的对话列表 */
  dialogues: IDialogue[]
  /** 创建时间 */
  createdAt: Date
  /** 最后更新时间 */
  updatedAt: Date
}

// ─── Schema 定义 ──────────────────────────────────────────────────────────────

const ImageItemSchema = new Schema<IImageItem>(
  {
    url: { type: String, required: true },
    alt: { type: String, default: undefined },
  },
  { _id: false }
)

const UserContentSchema = new Schema<IUserContent>(
  {
    prompt: { type: String, required: true },
    images: { type: [ImageItemSchema], default: [] },
  },
  { _id: false }
)

/**
 * AssistantContent 使用 Mixed 类型存储（discriminated union）。
 * 通过 type 字段区分具体类型，保持灵活性。
 */
const AssistantContentSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['text', 'tool_call', 'tool_result', 'pages_snapshot', 'schema_update', 'disambiguation', 'done', 'error'],
      required: true,
    },
  },
  {
    _id: false,
    strict: false, // 允许存储 type 之外的动态字段（text, id, name, input, result, pages 等）
  }
)

const MessageSchema = new Schema<IMessage>(
  {
    role: {
      type: String,
      enum: ['user', 'assistant'],
      required: true,
    },
    userContent: {
      type: UserContentSchema,
      default: undefined,
    },
    assistantContent: {
      type: [AssistantContentSchema],
      default: undefined,
    },
    createdAt: {
      type: Date,
      default: () => new Date(),
    },
  }
  // NOTE: 不设置 { _id: false }，让 mongoose 为每条消息自动生成 _id
)

const DialogueSchema = new Schema<IDialogue>(
  {
    type: {
      type: String,
      enum: ['chat', 'task'],
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
    messages: {
      type: [MessageSchema],
      default: [],
    },
    summary: {
      type: String,
      default: undefined,
    },
    embedding: {
      type: [Number],
      default: null,
    },
    createdAt: {
      type: Date,
      default: () => new Date(),
    },
    updatedAt: {
      type: Date,
      default: () => new Date(),
    },
  }
  // NOTE: 不设置 { _id: false }，让 mongoose 为每个 Dialogue 自动生成 _id
)

const ConversationSchema = new Schema<IConversation>(
  {
    appId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    dialogues: {
      type: [DialogueSchema],
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
