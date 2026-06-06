/**
 * 对话模型（Dialogue）— 独立顶层集合
 *
 * Dialogue 是一次完整用户-AI 交互的权威载体，承载状态机、消息、应用快照、规划产物。
 * 每个 done 态的 Dialogue.appJSON 构成应用的版本链，支撑回退。
 *
 * 生命周期（task 路径）：
 *   start → requirements → ui_design → contract → building → awaiting_confirm → committing → done
 *   awaiting_confirm 可回退到任意规划阶段（用户不满意时 rollback）
 *   任何进行中 phase 均可被中断 → discarded
 *   start / building / committing 出错 → failed
 *
 * 生命周期（chat 路径）：
 *   start → responding → done
 *
 * 索引设计：
 *   - { appId, createdAt }：按应用查询对话历史
 *   - { conversationId, createdAt }：通过 Conversation 查对话列表
 *   - { appId, phase }：查找进行中的对话（初始化降级流）
 *   - { phase, updatedAt }：TTL 清理卡在非终态的孤儿对话
 */

import mongoose, { Schema, type Document } from 'mongoose'
import type { IDialogueSummary, IInterruptMetadata, IDialogue } from './types/index.js'
import { CollectionDefSchema } from './CollectionSchema.js'
import { CloudFunctionEmbedSchema } from './CloudFunction.js'

// ─── Dialogue Mongoose 文档类型 ───────────────────────────────────────────────

/** Dialogue Mongoose 文档类型 */
export type IDialogueDoc = IDialogue & Document

// ─── Schema 定义 ──────────────────────────────────────────────────────────────

const DialogueSummarySchema = new Schema<IDialogueSummary>(
  {
    text: { type: String, required: true },
    embedding: { type: [Number], default: null },
    pageIds: { type: [String], default: [] },
    viewIds: { type: [String], default: [] },
    changeTags: { type: [String], default: [] },
  },
  { _id: false }
)

const InterruptMetadataSchema = new Schema<IInterruptMetadata>(
  {
    reason: {
      type: String,
      enum: ['user_aborted', 'connection_lost'],
      required: true,
    },
    interruptedAtPhase: {
      type: String,
      enum: [
        'start', 'requirements', 'ui_design', 'contract', 'building',
        'awaiting_confirm', 'committing', 'responding',
      ],
      required: true,
    },
    interruptedAt: {
      type: Date,
      default: () => new Date(),
    },
  },
  { _id: false }
)



/**
 * 消息子文档 Schema
 *
 * 接口类型（IMessage）定义在 models/types/message-types.ts，
 * Mongoose Schema 在此定义，供 Dialogue 模型使用。
 */
const AssistantContentSchema = new Schema(
  {
    type: {
      type: String,
      enum: [
        'text', 'tool_call', 'tool_result', 'app_snapshot',
        'schema_update', 'disambiguation', 'planning_progress', 'error',
      ],
      required: true,
    },
  },
  {
    _id: false,
    strict: false, // 允许存储 type 之外的动态字段
  }
)

const UserContentSchema = new Schema(
  {
    prompt: { type: String, required: true },
    images: {
      type: [new Schema({ url: { type: String, required: true }, alt: { type: String, default: undefined } }, { _id: false })],
      default: [],
    },
  },
  { _id: false }
)

const MessageSchema = new Schema(
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

const DialogueSchema = new Schema<IDialogueDoc>(
  {
    appId: {
      type: String,
      required: true,
      trim: true,
    },
    conversationId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    type: {
      type: String,
      enum: ['chat', 'task'],
      required: true,
    },
    phase: {
      type: String,
      enum: [
        'start', 'requirements', 'ui_design', 'contract', 'building',
        'awaiting_confirm', 'committing', 'responding',
        'done', 'discarded', 'failed',
      ],
      required: true,
      default: 'start',
    },
    threadId: {
      type: String,
      default: undefined,
    },
    messages: {
      type: [MessageSchema],
      default: [],
    },

    // ─── 应用快照 ────────────────────────────────────────────────────────────
    appJSON: {
      type: String,
      default: '',
    },
    collections: {
      type: [CollectionDefSchema],
      default: [],
    },
    cloudFunctions: {
      type: [CloudFunctionEmbedSchema],
      default: [],
    },

    // ─── 规划产物 ──────────────────────────────────────────────────────────
    planningEntries: {
      type: [new Schema(
        {
          agent: { type: String, required: true },
          output: { type: Schema.Types.Mixed, default: null },
          reasoning: { type: String, default: undefined },
          tokenUsage: {
            type: new Schema(
              { input: { type: Number, default: 0 }, output: { type: Number, default: 0 } },
              { _id: false }
            ),
            default: () => ({ input: 0, output: 0 }),
          },
          durationMs: { type: Number, default: 0 },
          createdAt: { type: Date, default: () => new Date() },
        },
        { _id: false }
      )],
      default: [],
    },
    // ─── Agent 记忆暂存 ───────────────────────────────────────────────────
    memoryUpdates: {
      type: Schema.Types.Mixed,
      default: undefined,
    },

    // ─── 摘要 ──────────────────────────────────────────────────────────────────
    summary: {
      type: DialogueSummarySchema,
      default: undefined,
    },

    // ─── 中断归因 ────────────────────────────────────────────────────────────
    interruptMetadata: {
      type: InterruptMetadataSchema,
      default: undefined,
    },
  },
  {
    timestamps: true,
    collection: 'dialogues',
  }
)

// ─── 索引 ─────────────────────────────────────────────────────────────────────

// 按应用查询对话历史（高频）
DialogueSchema.index({ appId: 1, createdAt: -1 })

// 通过 Conversation 查对话列表
DialogueSchema.index({ conversationId: 1, createdAt: -1 })

// 查找进行中的对话（初始化降级流：优先用在途 Dialogue 的 appJSON）
DialogueSchema.index({ appId: 1, phase: 1 })

// TTL 清理卡在非终态的孤儿对话
DialogueSchema.index({ phase: 1, updatedAt: 1 })

// ─── 模型 ─────────────────────────────────────────────────────────────────────

const Dialogue = mongoose.model<IDialogueDoc>('Dialogue', DialogueSchema)

export default Dialogue
