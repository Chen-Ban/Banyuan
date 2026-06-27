/**
 * 消息子文档 Schema（Message）
 *
 * 从 Dialogue.ts 提取为独立文件，供 Dialogue 模型使用。
 * 接口类型（IMessage / IUserContent / IAssistantContent）定义在 models/types/message.ts。
 *
 * Message 不是独立的顶层集合，而是 Dialogue 的嵌入式子文档数组。
 * Mongoose 为每条消息自动生成 _id（未设置 { _id: false }）。
 */

import { Schema } from 'mongoose'
import type { IUserContent, IAssistantContent } from '../types/index.js'

// ─── AssistantContent（助手消息内容块）─────────────────────────────────────────

export const AssistantContentSchema = new Schema(
  {
    type: {
      type: String,
      enum: [
        'text',
        'tool_call',
        'tool_result',
        'app_snapshot',
        'schema_update',
        'disambiguation',
        'planning_progress',
        'error',
      ],
      required: true,
    },
  },
  {
    _id: false,
  },
)

// ─── UserContent（用户消息内容）─────────────────────────────────────────────────

export const UserContentSchema = new Schema(
  {
    prompt: { type: String, required: true },
    images: {
      type: [
        new Schema(
          { url: { type: String, required: true }, alt: { type: String } },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { _id: false },
)

// ─── Message（消息子文档）──────────────────────────────────────────────────────

export const MessageSchema = new Schema(
  {
    role: {
      type: String,
      enum: ['user', 'assistant'],
      required: true,
    },
    content: { type: Schema.Types.Mixed, required: true },
    createdAt: {
      type: Date,
      default: () => new Date(),
    },
  },
  // 不设置 { _id: false }，让 mongoose 为每条消息自动生成 _id
)
