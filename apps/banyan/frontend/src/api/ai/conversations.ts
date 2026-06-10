/**
 * 对话会话 API（V2）
 *
 * 基于"1 App = 1 Conversation"模型，以 appId 为唯一标识。
 * V2 变更：返回 Dialogue[] 而非扁平 Message[]。
 *
 * 核心概念：
 *   - Dialogue（对话）：一次完整的用户-AI 交互单元
 *   - DialogueType：chat（纯聊天）| task（做任务，会修改应用状态）
 *   - AssistantContent：助手消息的内容块，与 SSE 事件类型一一对应
 */

import { get } from '../client'

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

/** 对话类型 */
export type DialogueType = 'chat' | 'task'

/** 图片项 */
export interface ImageItem {
  url: string
  alt?: string
}

/** 用户消息内容（结构化） */
export interface UserContent {
  prompt: string
  images: ImageItem[]
}

/** 助手消息内容块（discriminated union，与 SSE 事件类型对应） */
export type AssistantContent =
  | { type: 'text'; text: string }
  | { type: 'tool_activity'; agent: string; tool: string; status: 'started' | 'completed' | 'error' }
  | { type: 'agent_progress'; agent: string; status: 'started' | 'completed' | 'error'; message: string }
  | { type: 'done'; summary: string }
  | { type: 'error'; message: string }

/** 消息 */
export interface Message {
  _id?: string
  role: 'user' | 'assistant'
  /** 用户消息内容（仅 role=user 时有值） */
  userContent?: UserContent
  /** 助手消息内容块列表（仅 role=assistant 时有值） */
  assistantContent?: AssistantContent[]
  createdAt: string
}

/** 对话（Dialogue）— 核心聚合单元 */
export interface Dialogue {
  _id: string
  type: DialogueType
  /** 当前阶段（ADR-041 唯一权威状态机） */
  phase: string
  messages: Message[]
  /** XiangDi 执行线程 ID */
  threadId?: string
  /** 对话摘要（由 AI 生成，结构化） */
  summary?: { text: string; pageIds: string[]; viewIds: string[]; changeTags: string[] }
  createdAt: string
  updatedAt: string
}

/** 兼容旧接口的扁平消息格式（用于渐进迁移） */
export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string | unknown[]
}

// ─── 响应类型 ─────────────────────────────────────────────────────────────────

export interface GetDialoguesResponse {
  success: boolean
  data: {
    dialogues: Dialogue[]
  }
}

// ─── API 方法 ─────────────────────────────────────────────────────────────────

/**
 * 获取应用的对话历史（Dialogue 列表）
 */
export async function getDialogues(appId: string, limit = 50): Promise<Dialogue[]> {
  const res = await get<GetDialoguesResponse>(
    `/applications/${appId}/conversation/dialogues`,
    { limit }
  )
  return res.data?.dialogues ?? []
}

/**
 * 兼容旧接口：将 Dialogue[] 转换为扁平 ConversationMessage[]
 *
 * 用于渐进迁移期间，让旧组件仍能正常工作。
 */
export function dialoguesToFlatMessages(dialogues: Dialogue[]): ConversationMessage[] {
  const messages: ConversationMessage[] = []

  for (const dialogue of dialogues) {
    for (const msg of dialogue.messages) {
      if (msg.role === 'user' && msg.userContent) {
        messages.push({
          role: 'user',
          content: msg.userContent.prompt,
        })
      } else if (msg.role === 'assistant' && msg.assistantContent) {
        // 提取文本内容
        const textBlocks = msg.assistantContent.filter(
          (block): block is Extract<AssistantContent, { type: 'text' }> => block.type === 'text'
        )
        const text = textBlocks.map(b => b.text).join('')
        if (text) {
          messages.push({
            role: 'assistant',
            content: text,
          })
        }
      }
    }
  }

  return messages
}
