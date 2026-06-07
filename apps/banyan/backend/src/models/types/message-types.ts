/**
 * 消息类型契约（Message Type Contracts）
 *
 * 定义对话消息的完整类型体系，被多个模型和服务共享引用：
 *   - Dialogue（消息存储的权威载体）
 *   - ConversationService（读取消息用于前端展示）
 *   - AiService（构造 assistant 消息内容块）
 *   - ContextBuilder（消息提取用于上下文构建）
 *
 * 从 Conversation.ts 中提取为独立共享类型，使 Conversation
 * 退化为纯索引容器后不再承担消息类型定义的职责。
 */

import type { Types } from 'mongoose'

// ─── 枚举类型 ─────────────────────────────────────────────────────────────────

/** 助手消息内容块类型 */
export type AssistantContentType =
  | 'text'
  | 'tool_call'
  | 'tool_result'
  | 'app_snapshot'
  | 'schema_update'
  | 'disambiguation'
  | 'planning_progress'
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

/** 应用快照 */
export interface IAppSnapshotContent extends IAssistantContentBase {
  type: 'app_snapshot'
  appJSON: string
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

/** 规划进度 */
export interface IPlanningProgressContent extends IAssistantContentBase {
  type: 'planning_progress'
  agent: string
  status: string
  output?: unknown
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
  | IAppSnapshotContent
  | ISchemaUpdateContent
  | IDisambiguationContent
  | IPlanningProgressContent
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
