/**
 * 会话模型（Conversation）— 轻量索引容器
 *
 * 一个 Application 对应一个 Conversation（1:1 关系）。
 * 以 appId 为唯一索引，维护 appId → Dialogue[] 的引用关系。
 * 所有对话内容、状态机、快照由独立 Dialogue 集合承载。
 * 消息类型契约定义在 models/types/message-types.ts。
 */

import mongoose, { Schema, Document, Types } from 'mongoose'

// ─── Conversation 文档接口 ────────────────────────────────────────────────────

export interface IConversation extends Document {
  /** 关联的应用 ID（唯一索引，1 App = 1 Conversation） */
  appId: string
  /** 按时间顺序的 Dialogue 引用列表（指向独立 Dialogue 集合） */
  dialogueIds: Types.ObjectId[]
  /** 创建时间 */
  createdAt: Date
  /** 最后更新时间 */
  updatedAt: Date
}

// ─── Schema 定义 ──────────────────────────────────────────────────────────────

const ConversationSchema = new Schema<IConversation>(
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

const Conversation = mongoose.model<IConversation>('Conversation', ConversationSchema)

export default Conversation
