/**
 * SubAgent 统一协议
 *
 * ADR-041: Orchestrator + 领域 SubAgent 统一管线
 *
 * 所有 SubAgent（规划型 + 执行型）遵循统一的输入/输出协议。
 * Orchestrator 据此声明式调度，不关心子图内部是单次调用还是多轮循环。
 */
import type { ZodSchema } from 'zod'

// ─── SubAgent 名称枚举 ─────────────────────────────────────────────────────

export const SUBAGENT_NAMES = ['requirements', 'uiDesign', 'contract', 'frontend', 'backend'] as const
export type SubAgentName = typeof SUBAGENT_NAMES[number]

// ─── SubAgent 描述符（声明式注册）──────────────────────────────────────────

export interface SubAgentDescriptor<TOutput = unknown> {
  /** SubAgent 唯一名称 */
  name: SubAgentName
  /** 角色描述（如"产品经理"/"前端工程师"） */
  role: string
  /** 执行模式：planning=单次LLM+结构化输出，execution=多轮think↔tools */
  mode: 'planning' | 'execution'
  /** 声明依赖的前序工件（Orchestrator 据此从 ArtifactStore 提取输入） */
  dependencies: SubAgentName[]
  /** 输出验证 Zod schema */
  outputSchema: ZodSchema<TOutput>
  /** 工具白名单（执行型必填） */
  tools?: string[]
  /** 执行型的 think↔tools 循环上限 */
  maxIterations?: number
  /** 全局超时（毫秒） */
  timeoutMs?: number
}

// ─── SubAgent 统一输入 ─────────────────────────────────────────────────────

export interface SubAgentInput {
  /** 用户原始诉求 */
  userMessage: string
  /** 前序工件（Orchestrator 根据 dependencies 自动提取） */
  artifacts: Record<string, unknown>
  /** L2 Agent 记忆 */
  agentMemory: string
  /** L3 上下文摘要（ContextBuilder 产出） */
  conversationContext: string
  /** 回退时注入的审计反馈（修正指令） */
  auditFeedback?: string
}

// ─── SubAgent 统一输出 ─────────────────────────────────────────────────────

export interface SubAgentOutput<TOutput = unknown> {
  /** 结构化产出（Zod 验证通过） */
  artifact: TOutput
  /** 推理过程摘要（调试 + 日志） */
  reasoning: string
  /** 执行元数据 */
  metadata: SubAgentMetadata
}

export interface SubAgentMetadata {
  /** 实际循环次数（规划型固定为 1） */
  iterations: number
  /** 执行耗时（毫秒） */
  durationMs: number
  /** 工具调用次数（规划型为 0） */
  toolCalls: number
}

// ─── SubAgent 错误协议 ─────────────────────────────────────────────────────

export type SubAgentErrorPhase =
  | 'llm_call'
  | 'tool_execution'
  | 'output_validation'
  | 'timeout'

export interface SubAgentError {
  /** 出错的 SubAgent */
  agentName: SubAgentName
  /** 错误阶段 */
  phase: SubAgentErrorPhase
  /** 错误描述 */
  message: string
  /** 部分产出（如有） */
  partialOutput?: unknown
  /** 是否可在 SubAgent 内部重试 */
  retriable: boolean
  /** tool_execution 时记录工具名 */
  toolName?: string
}

// ─── 依赖图 ─────────────────────────────────────────────────────────────────

/** SubAgent 间的依赖关系（静态声明） */
export const SUBAGENT_DEPENDENCIES: Record<SubAgentName, SubAgentName[]> = {
  requirements: [],
  uiDesign: ['requirements'],
  contract: ['requirements', 'uiDesign'],
  frontend: ['contract', 'uiDesign'],
  backend: ['contract', 'requirements'],
}

/**
 * 获取目标节点及其所有下游依赖节点（用于回退时清空工件）
 *
 * 例如：getDependents('contract') → ['contract', 'frontend', 'backend']
 */
export function getDependents(target: SubAgentName): SubAgentName[] {
  const result = new Set<SubAgentName>([target])
  const queue: SubAgentName[] = [target]

  while (queue.length > 0) {
    const current = queue.shift()!
    for (const name of SUBAGENT_NAMES) {
      if (!result.has(name) && SUBAGENT_DEPENDENCIES[name].includes(current)) {
        result.add(name)
        queue.push(name)
      }
    }
  }

  return [...result]
}

/** SOP 流水线拓扑序（正向执行顺序） */
export const SUBAGENT_TOPO_ORDER: SubAgentName[] = [
  'requirements', 'uiDesign', 'contract', 'frontend', 'backend',
]

/**
 * 判断两个 SubAgent 是否可以并行执行（互不依赖）
 */
export function canRunInParallel(a: SubAgentName, b: SubAgentName): boolean {
  return !SUBAGENT_DEPENDENCIES[a].includes(b) && !SUBAGENT_DEPENDENCIES[b].includes(a)
}
