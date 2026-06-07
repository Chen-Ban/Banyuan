/**
 * 会话模型（Conversation）— 轻量索引容器
 *
 * 一个 Application 对应一个 Conversation（1:1 关系）。
 * 以 appId 为唯一索引，维护 appId → Dialogue[] 的引用关系。
 * 所有对话内容、状态机、快照由独立 Dialogue 集合承载。
 * 消息类型契约定义在 models/types/message-types.ts。
 */

import mongoose, { Schema, Document } from 'mongoose'
import type { IConversation } from './types/index.js'

// ─── 本地文档类型 ─────────────────────────────────────────────────────────────

export type IConversationDoc = IConversation & Document

// ─── Schema 定义 ──────────────────────────────────────────────────────────────

const ConversationSchema = new Schema<IConversationDoc>(
  {
    appId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    dialogueIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Dialogue' }],
      default: [],
    },
  },
  {
    timestamps: true,
  }
)

// ─── 模型 ─────────────────────────────────────────────────────────────────────

const Conversation = mongoose.model<IConversationDoc>('Conversation', ConversationSchema)

export default Conversation
