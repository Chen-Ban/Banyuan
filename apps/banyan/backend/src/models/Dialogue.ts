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

import mongoose, { Schema, Document, Types } from 'mongoose'
import type { IMessage } from './types/message-types.js'
import type { ICollectionDef } from './CollectionSchema.js'
import { CollectionDefSchema } from './CollectionSchema.js'
import type { ICloudFunction } from './CloudFunction.js'
import { CloudFunctionEmbedSchema } from './CloudFunction.js'
import type { MemoryUpdateInput } from '../services/MemoryService.js'

// ─── 枚举类型 ─────────────────────────────────────────────────────────────────

/** Dialogue 生命周期阶段（唯一权威状态机 — ADR-041） */
export type DialoguePhase =
  | 'start'             // 准备中（确定性非 LLM 区段：组装上下文）
  | 'requirements'      // 需求解析（SubAgent: requirements）
  | 'ui_design'         // UI 设计（SubAgent: uiDesign）
  | 'contract'          // 契约定义（SubAgent: contract）
  | 'building'          // 构建中（SubAgent: frontend + backend 并行）
  | 'awaiting_confirm'  // 待确认（审计通过，等用户操作）
  | 'committing'        // 提交中（落库 + 总结）
  | 'responding'        // 回答中（chat 子路径，可含只读工具调用）
  | 'done'              // 完成（终态）
  | 'discarded'         // 已放弃/被打断（终态）
  | 'failed'            // 失败（终态）

/** 对话类型（intent 节点的默认分流信号来源） */
export type DialogueType = 'chat' | 'task'

/** 中断归因 */
export type DiscardReason = 'user_aborted' | 'connection_lost'

// ─── 结构化 Summary ──────────────────────────────────────────────────────────

/** 变更类型标签 */
export type ChangeTag = 'create' | 'update' | 'delete' | 'style' | 'bindFlow' | 'data' | 'cloudFunction'

/**
 * 结构化对话摘要
 *
 * 用途：
 *   1. intent 节点的判别输入（判断"延续/微调/全新"需要知道上一轮改了什么）
 *   2. ContextBuilder 的 embedding 源（summary.text 向量化后做语义召回）
 *   3. 历史回放的结构化索引（按 pageIds/changeTags 过滤历史）
 */
export interface IDialogueSummary {
  /** 本轮意图的自然语言摘要 */
  text: string
  /** text 的向量嵌入（384 维，multilingual-e5-small） */
  embedding?: number[] | null
  /** 涉及的页面 ID 列表 */
  pageIds: string[]
  /** 变更的 View ID 列表（仅 task 有值） */
  viewIds: string[]
  /** 变更类型标签集合 */
  changeTags: ChangeTag[]
}

// ─── 规划产物条目 ─────────────────────────────────────────────────────────────

/**
 * 单个 SubAgent 的规划产出条目
 *
 * 各阶段 SubAgent（requirements/ui_design/contract/building）的产出记录。
 */
export interface IPlanningEntry {
  /** Agent 角色 */
  agent: string
  /** 产出内容 */
  output: unknown
  /** 推理过程 */
  reasoning?: string
  /** Token 使用量 */
  tokenUsage: { input: number; output: number }
  /** 耗时（毫秒） */
  durationMs: number
  /** 产出时间 */
  createdAt?: Date
}

// ─── 中断归因 Metadata ─────────────────────────────────────────────────────────

export interface IInterruptMetadata {
  /** 归因 */
  reason: DiscardReason
  /** 中断时的 phase（进入 discarded 之前处于哪个 phase） */
  interruptedAtPhase: DialoguePhase
  /** 中断时间 */
  interruptedAt: Date
}

// ─── Dialogue 文档接口 ─────────────────────────────────────────────────────────

export interface IDialogueDoc extends Document {
  /** 关联的应用 ID */
  appId: string
  /** 关联的 Conversation ID（反向索引） */
  conversationId: Types.ObjectId
  /** 对话类型（chat / task） */
  type: DialogueType
  /** 当前阶段（唯一权威状态机） */
  phase: DialoguePhase
  /** XiangDi 执行线程 ID */
  threadId?: string

  /** 该对话内的所有消息（按时间顺序） */
  messages: IMessage[]

  // ─── 应用状态（phase=done 时为最终确认态）─────────────────────────────────
  /** App 级别序列化 JSON（构建期间增量更新，done 时为确认版本） */
  appJSON: string
  /** 数据库表定义 */
  collections: ICollectionDef[]
  /** 云函数定义 */
  cloudFunctions: ICloudFunction[]

  // ─── 规划产物 ──────────────────────────────────────────────────────────
  /** 各 SubAgent 阶段的规划产出记录 */
  planningEntries: IPlanningEntry[]

  // ─── Agent 记忆暂存 ────────────────────────────────────────────────────
  /** 暂存的 Agent 记忆更新（confirm 时落库） */
  memoryUpdates?: MemoryUpdateInput

  // ─── 摘要 ────────────────────────────────────────────────────────────────
  /** 结构化对话摘要（done 时由 summarize 节点产出，含 embedding） */
  summary?: IDialogueSummary

  // ─── 中断归因 ────────────────────────────────────────────────────────────
  /** 中断元信息（仅 phase=discarded 时有值） */
  interruptMetadata?: IInterruptMetadata

  // ─── 时间戳 ──────────────────────────────────────────────────────────────
  createdAt: Date
  updatedAt: Date
}

// ─── Phase 转移合法矩阵 ──────────────────────────────────────────────────────

/**
 * Phase 状态转移规则（ADR-041）。
 * DialogueService.setPhase() 应基于此做转移校验，非法转移抛异常。
 *
 * task 主路径：start → requirements → ui_design → contract → building → awaiting_confirm → committing → done
 * chat 路径：start → responding → done
 * awaiting_confirm 可回退到任意规划/构建阶段（用户不满意时 rollback）
 */
export const PHASE_TRANSITIONS: Record<DialoguePhase, DialoguePhase[]> = {
  start: ['requirements', 'ui_design', 'contract', 'building', 'responding', 'failed'],
  requirements: ['ui_design', 'failed', 'discarded'],
  ui_design: ['contract', 'failed', 'discarded'],
  contract: ['building', 'failed', 'discarded'],
  building: ['awaiting_confirm', 'failed', 'discarded'],
  awaiting_confirm: ['committing', 'requirements', 'ui_design', 'contract', 'building', 'discarded'],
  committing: ['done', 'failed'],
  responding: ['done', 'failed', 'discarded'],
  // 终态不可转移
  done: [],
  discarded: [],
  failed: [],
}

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
