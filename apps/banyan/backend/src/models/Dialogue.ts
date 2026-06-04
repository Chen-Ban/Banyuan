/**
 * 对话模型（Dialogue）— ADR-039 独立顶层集合
 *
 * Dialogue 是整条 AI 对话链路的唯一权威状态机。
 * SSE 契约是会话模型的实时投影，副作用写回与多智能体写回是会话模型在特定阶段（phase）的产物。
 *
 * 设计决策（ADR-039）：
 *   - Dialogue 从 Conversation 子文档提升为独立顶层集合
 *   - phase 字段是唯一状态机，取代原 threadStatus / Snapshot.status / PlanningArtifact.status
 *   - 应用快照（appJSON/collections/cloudFunctions）内嵌于 Dialogue，取代独立 Snapshot 集合
 *   - 规划产物以 planning_progress 内容块融入 messages，取代独立 PlanningArtifact 集合
 *   - 结构化 summary 取代纯文本 summary，支撑 intent 节点精确意图判别
 *   - 中断归因 metadata 记录 discarded 终态的来源
 *
 * 生命周期（task 路径）：
 *   start → planning → awaiting_confirm → executing → committing → done
 *   任何进行中 phase 均可被中断 → discarded
 *   start / executing / committing 出错 → failed
 *
 * 生命周期（chat 子路径，task 的退化路径）：
 *   start → responding → done
 *
 * 索引设计：
 *   - { appId, createdAt }：按应用查询对话历史
 *   - { conversationId, createdAt }：通过 Conversation 查对话列表
 *   - { appId, phase }：查找进行中的对话（初始化降级流）
 *   - { phase, updatedAt }：TTL 清理卡在非终态的孤儿对话
 */

import mongoose, { Schema, Document, Types } from 'mongoose'
import type { IMessage } from './Conversation.js'
import type { ICollectionSnapshot, ICloudFunctionSnapshot } from './types/snapshot-types.js'
import type { MemoryUpdateInput } from '../services/MemoryService.js'

// ─── 枚举类型 ─────────────────────────────────────────────────────────────────

/** Dialogue 生命周期阶段（唯一权威状态机） */
export type DialoguePhase =
  | 'start'             // 准备中（确定性非 LLM 区段：组装上下文）
  | 'planning'          // 规划中（agent 在思考/产出方案）
  | 'awaiting_confirm'  // 待确认（方案已出，等用户操作）
  | 'executing'         // 执行中（产生副作用，改画布）
  | 'committing'        // 提交中（落库）
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
  /** 本轮意图的自然语言摘要（供 embedding 向量化） */
  text: string
  /** 涉及的页面 ID 列表 */
  pageIds: string[]
  /** 变更的 View ID 列表（仅 task 有值） */
  viewIds: string[]
  /** 变更类型标签集合 */
  changeTags: ChangeTag[]
}

// ─── 规划产物条目（替代 PlanningArtifact 独立集合）────────────────────────────

/**
 * 单个 Agent 的规划产出条目
 *
 * 融入 Dialogue 后，规划产物不再需要独立集合。
 * 对应原 PlanningArtifactService.writeAgentOutput 的数据结构。
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

  // ─── 应用快照（原 Snapshot 的职责，phase 决定"认不认账"）─────────────────
  /** App 级别序列化 JSON（executing 期间增量更新） */
  appJSON: string
  /** 数据库表定义快照 */
  collections: ICollectionSnapshot[]
  /** 云函数快照 */
  cloudFunctions: ICloudFunctionSnapshot[]

  // ─── 规划产物（替代 PlanningArtifact 独立集合）──────────────────────────
  /** 规划产物条目列表（planning phase 内各 Agent 产出） */
  planningEntries: IPlanningEntry[]
  /** 规划失败的 Agent 名称 */
  planningFailedAgent?: string

  // ─── Agent 记忆暂存（原 PendingStore.memoryUpdates）─────────────────────
  /** 暂存的 Agent 记忆更新（confirm 时落库） */
  memoryUpdates?: MemoryUpdateInput

  // ─── 基线 AppJSON（task 模式 diff/回滚判断）──────────────────────────────
  /** task 开始时的应用快照基线（用于计算 diff） */
  baseAppJSON?: string

  // ─── 摘要与嵌入 ──────────────────────────────────────────────────────────
  /** 结构化对话摘要（done 时由 summarize 节点产出） */
  summary?: IDialogueSummary
  /** summary.text 的向量嵌入（384 维，multilingual-e5-small） */
  embedding?: number[] | null

  // ─── 中断归因 ────────────────────────────────────────────────────────────
  /** 中断元信息（仅 phase=discarded 时有值） */
  interruptMetadata?: IInterruptMetadata

  // ─── 时间戳 ──────────────────────────────────────────────────────────────
  createdAt: Date
  updatedAt: Date
}

// ─── Phase 转移合法矩阵 ──────────────────────────────────────────────────────

/**
 * Phase 状态转移规则。
 * DialogueService.setPhase() 应基于此做转移校验，非法转移抛异常。
 */
export const PHASE_TRANSITIONS: Record<DialoguePhase, DialoguePhase[]> = {
  start: ['planning', 'responding', 'failed'],
  planning: ['awaiting_confirm', 'discarded'],
  awaiting_confirm: ['executing', 'planning', 'discarded'],
  executing: ['committing', 'failed', 'discarded'],
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
      enum: ['start', 'planning', 'awaiting_confirm', 'executing', 'committing', 'responding'],
      required: true,
    },
    interruptedAt: {
      type: Date,
      default: () => new Date(),
    },
  },
  { _id: false }
)

const FieldSnapshotSchema = new Schema(
  {
    name: { type: String, required: true },
    displayName: { type: String, required: true },
    type: { type: String, required: true },
    required: { type: Boolean, default: false },
    defaultValue: { type: Schema.Types.Mixed, default: undefined },
    refCollection: { type: String, default: undefined },
    enumValues: { type: [String], default: undefined },
  },
  { _id: false }
)

const CollectionSnapshotSchema = new Schema(
  {
    name: { type: String, required: true },
    displayName: { type: String, required: true },
    fields: { type: [FieldSnapshotSchema], default: [] },
  },
  { _id: false }
)

const CloudFunctionSnapshotSchema = new Schema(
  {
    functionId: { type: String, required: true },
    name: { type: String, required: true },
    displayName: { type: String, default: '' },
    flowSchema: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
)

/**
 * 消息 Schema（复用 Conversation.ts 中的结构定义）
 *
 * 注：这里重新定义 Schema 而非 import Conversation 的 MessageSchema，
 * 因为 Mongoose Schema 实例不应在多个模型间共享（会导致 hooks/middleware 污染）。
 * 接口类型（IMessage）通过 import type 共享，Schema 各自定义。
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
        'start', 'planning', 'awaiting_confirm', 'executing',
        'committing', 'responding', 'done', 'discarded', 'failed',
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
      type: [CollectionSnapshotSchema],
      default: [],
    },
    cloudFunctions: {
      type: [CloudFunctionSnapshotSchema],
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
    planningFailedAgent: {
      type: String,
      default: undefined,
    },

    // ─── Agent 记忆暂存 ───────────────────────────────────────────────────
    memoryUpdates: {
      type: Schema.Types.Mixed,
      default: undefined,
    },

    // ─── 基线 AppJSON ─────────────────────────────────────────────────────
    baseAppJSON: {
      type: String,
      default: undefined,
    },

    // ─── 摘要与嵌入 ──────────────────────────────────────────────────────────
    summary: {
      type: DialogueSummarySchema,
      default: undefined,
    },
    embedding: {
      type: [Number],
      default: null,
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
