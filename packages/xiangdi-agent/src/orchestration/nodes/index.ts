/**
 * Orchestrator 节点工厂 barrel
 *
 * ADR-041: 所有 Orchestrator 图节点的统一导出。
 */

// ─── 共享工具 ────────────────────────────────────────────────────────────────
export { callSubAgentLLM, parseWithRetry, buildExecution, emitProgress } from './shared.js'

export type { SubAgentLLMCallConfig, ParseWithRetryConfig, ParseResult } from './shared.js'

// ─── Intent 节点 ─────────────────────────────────────────────────────────────
export { createIntentNode } from './intentNode.js'
export type { IntentNodeConfig } from './intentNode.js'

// ─── Respond 节点 ────────────────────────────────────────────────────────────
export { createRespondNode } from './respondNode.js'
export type { RespondNodeConfig } from './respondNode.js'

// ─── Requirements SubAgent ───────────────────────────────────────────────────
export { createRequirementsNode } from './requirementsNode.js'
export type { RequirementsNodeConfig } from './requirementsNode.js'

// ─── UI Design SubAgent ──────────────────────────────────────────────────────
export { createUIDesignNode } from './uiDesignNode.js'
export type { UIDesignNodeConfig } from './uiDesignNode.js'

// ─── Contract SubAgent ───────────────────────────────────────────────────────
export { createContractNode } from './contractNode.js'
export type { ContractNodeConfig } from './contractNode.js'

// ─── Worker SubGraph ──────────────────────────────────────────────────────────
export { createWorkerGraph, extractFinalText } from './workerGraph.js'
export type { WorkerGraphConfig, WorkerState } from './workerGraph.js'

// ─── Worker 工具定义 ──────────────────────────────────────────────────────────
export { createFrontendToolRegistry, createBackendToolRegistry } from './workerTools.js'
export type { FrontendToolHandlers, BackendToolHandlers } from './workerTools.js'

// ─── Frontend Worker SubAgent ────────────────────────────────────────────────
export { createFrontendNode } from './frontendNode.js'
export type { FrontendNodeConfig } from './frontendNode.js'

// ─── Backend Worker SubAgent ─────────────────────────────────────────────────
export { createBackendNode } from './backendNode.js'
export type { BackendNodeConfig } from './backendNode.js'

// ─── Audit Node ──────────────────────────────────────────────────────────────
export { createAuditNode } from './auditNode.js'
export type { AuditNodeConfig } from './auditNode.js'

// ─── Rollback Node ───────────────────────────────────────────────────────────
export { createRollbackNode } from './rollbackNode.js'
export type { RollbackNodeConfig } from './rollbackNode.js'

// ─── Commit Node ─────────────────────────────────────────────────────────────
export { createCommitNode } from './commitNode.js'
export type { CommitNodeConfig } from './commitNode.js'

// ─── Summarize Node ──────────────────────────────────────────────────────────
export { createSummarizeNode } from './summarizeNode.js'
export type { SummarizeNodeConfig } from './summarizeNode.js'
