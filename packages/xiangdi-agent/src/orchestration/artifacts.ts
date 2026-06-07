/**
 * 工件仓库（ArtifactStore）
 *
 * ADR-041: Orchestrator 管理的共享状态。
 * 每个 SubAgent 可读取前序工件，只能写入自己的工件槽。
 * 回退时，目标节点及其后续节点的工件被清空。
 */
import type { SubAgentName } from './protocol.js'
import type {
  StructuredRequirements,
  UIDesignSpec,
  IntegrationContract,
  FrontendArtifacts,
  BackendArtifacts,
} from './schemas.js'

// ─── 工件仓库接口 ──────────────────────────────────────────────────────────

/**
 * 工件仓库类型
 *
 * 每个槽对应一个 SubAgent 的结构化产出（由 Zod schema 验证）。
 * 运行中的 ArtifactStore 由 Orchestrator 持有，SubAgent 只能写入自己的槽。
 */
export interface ArtifactStore {
  requirements?: StructuredRequirements
  uiDesign?: UIDesignSpec
  contract?: IntegrationContract
  frontend?: FrontendArtifacts
  backend?: BackendArtifacts
}

// ─── Artifact 更新操作（reducer 使用）────────────────────────────────────────

export type ArtifactUpdate =
  | { type: 'set'; key: SubAgentName; value: unknown }
  | { type: 'clearFrom'; target: SubAgentName }

// ─── Intent 结果 ────────────────────────────────────────────────────────────

export interface IntentResult {
  /** 从哪个节点开始执行 */
  startFrom: SubAgentName
  /** 判断理由（调试日志） */
  reasoning: string
  /** 用户消息中的修正要点（注入目标节点的 auditFeedback） */
  correctionHint?: string
  /** 上下文策略：fresh=不复用历史工件，inherit=从历史恢复 */
  contextStrategy: 'fresh' | 'inherit'
}

// ─── 审计结果 ────────────────────────────────────────────────────────────────

export type AuditFailCategory =
  | 'reference_integrity'
  | 'schema_validation'
  | 'requirement_coverage'
  | 'worker_failure'
  | 'semantic_inconsistency'

export interface AuditFailReason {
  category: AuditFailCategory
  description: string
  involvedArtifacts: SubAgentName[]
}

export interface AuditResult {
  passed: boolean
  failReasons?: AuditFailReason[]
  suggestedTarget?: SubAgentName
}

// ─── 回退结果 ────────────────────────────────────────────────────────────────

export interface RollbackResult {
  /** 退到哪个节点 */
  target: SubAgentName
  /** 判断理由（调试日志） */
  reasoning: string
  /** 注入目标节点的修正指令 */
  feedbackForTarget: string
}

// ─── 节点执行记录 ────────────────────────────────────────────────────────────

export interface NodeExecution {
  node: SubAgentName
  startedAt: number
  completedAt?: number
  status: 'running' | 'completed' | 'failed'
  error?: string
}
