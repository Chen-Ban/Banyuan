/**
 * 对话（Dialogue）类型定义
 *
 * Dialogue 是一次完整用户-AI 交互的权威载体，承载状态机、消息、应用快照、规划产物。
 * 每个 done 态的 Dialogue.appJSON 构成应用的版本链，支撑回退。
 */

import type { Types } from 'mongoose'
import type { IMessage } from './message-types.js'
import type { ICollectionDef } from './collection.js'
import type { ICloudFunction } from './cloud-function.js'

// ─── 枚举类型 ─────────────────────────────────────────────────────────────────

/** Dialogue 生命周期阶段（唯一权威状态机） */
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

// ─── 记忆更新输入（来自 SSE memory_update 事件）──────────────────────────────────

/** Agent 记忆更新输入结构 */
export interface IMemoryUpdateInput {
  episode: {
    title: string
    content: string
    outcome: 'success' | 'failure' | 'partial' | 'aborted'
    lessons: string[]
    involvedEntities: string[]
    tags: string[]
    importance: number
  }
  facts: Array<{
    category: string
    content: string
    confidence: number
    derivedFrom: string[]
  }>
}

// ─── Dialogue 文档数据接口 ──────────────────────────────────────────────────────

export interface IDialogue {
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
  memoryUpdates?: IMemoryUpdateInput

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
 * Phase 状态转移规则。
 * DialogueService.setPhase() 基于此做转移校验，非法转移抛异常。
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
