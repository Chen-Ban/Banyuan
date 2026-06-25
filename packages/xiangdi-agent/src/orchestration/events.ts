/**
 * Orchestrator SSE 事件类型
 *
 * ADR-041: 4 类细粒度 SSE 事件，取代旧的 text_delta/tool_call/done 粗粒度事件。
 * 前端通过 discriminated union 的 `type` 字段区分事件类型。
 */
import type { DialoguePhase } from './phases.js'
import type { SubAgentName } from './protocol.js'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. phase_change — Phase 转移事件
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface PhaseChangeEvent {
  type: 'phase_change'
  from: DialoguePhase
  to: DialoguePhase
  timestamp: number
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. agent_progress — SubAgent 运行进度
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type AgentProgressStatus = 'planning' | 'executing' | 'completed' | 'failed'

export interface AgentProgressEvent {
  type: 'agent_progress'
  agent: SubAgentName
  status: AgentProgressStatus
  /** 自然语言进度描述（给用户看的） */
  message: string
  timestamp: number
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. tool_activity — 工具调用通知
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ToolActivityStatus = 'calling' | 'success' | 'error'

export interface ToolActivityEvent {
  type: 'tool_activity'
  agent: SubAgentName
  tool: string
  status: ToolActivityStatus
  /** 工具输入摘要（脱敏/截断后给前端展示） */
  inputSummary?: string
  /** 工具输出摘要（成功时） */
  outputSummary?: string
  /** 错误信息（失败时） */
  error?: string
  timestamp: number
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. audit_progress — 审计进度（building 内部，用户不可见 phase 回退）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type AuditProgressStatus = 'checking' | 'passed' | 'failed_retrying'

export interface AuditProgressEvent {
  type: 'audit_progress'
  status: AuditProgressStatus
  /** failed_retrying 时的提示信息，如"发现问题，正在优化..." */
  message?: string
  timestamp: number
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. text_delta — 文本流式输出（respond 子图使用）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface TextDeltaEvent {
  type: 'text_delta'
  /** 文本片段 */
  delta: string
  timestamp: number
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. done — 流结束信号
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 产出概览（前端据此决定展示什么） */
export interface DoneArtifactsOverview {
  pagesModified: string[]
  collectionsModified: string[]
  functionsModified: string[]
}

export interface DoneSSEEvent {
  type: 'done'
  /** 本轮最终 phase */
  finalPhase: DialoguePhase
  /** 用户可读的变更摘要 */
  summary: string
  /** 产出概览 */
  artifacts?: DoneArtifactsOverview
  /** 全局 token 消耗总量（精确值，来自 LLM API） */
  tokenUsage?: {
    inputTokens: number
    outputTokens: number
  }
  timestamp: number
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Discriminated Union + Callback
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Orchestrator 所有 SSE 事件的 Discriminated Union
 */
export type OrchestratorSSEEvent =
  | PhaseChangeEvent
  | AgentProgressEvent
  | ToolActivityEvent
  | AuditProgressEvent
  | TextDeltaEvent
  | DoneSSEEvent

/**
 * SSE 事件回调函数签名
 *
 * Orchestrator 图运行时，通过此回调向上游（HTTP handler）推送事件。
 * 上游序列化为 `data: JSON\n\n` 格式写入 SSE 响应流。
 */
export type OrchestratorSSECallback = (event: OrchestratorSSEEvent) => void
