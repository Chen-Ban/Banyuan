/**
 * 相地 · 编排层类型定义
 *
 * ADR-041: Orchestrator + 领域 SubAgent 统一管线
 *
 * 本文件重导出 protocol.ts 和 artifacts.ts 中的类型，
 * 作为 orchestration 层的统一类型入口。
 */

export type {
  // SubAgent 协议
  SubAgentName,
  SubAgentDescriptor,
  SubAgentInput,
  SubAgentOutput,
  SubAgentMetadata,
  SubAgentErrorPhase,
  SubAgentError,
} from './protocol.js'

export {
  SUBAGENT_NAMES,
  SUBAGENT_DEPENDENCIES,
  SUBAGENT_TOPO_ORDER,
  getDependents,
  canRunInParallel,
} from './protocol.js'

export type {
  // 工件仓库
  ArtifactStore,
  ArtifactUpdate,
  // Intent
  IntentResult,
  // 审计
  AuditFailCategory,
  AuditFailReason,
  AuditResult,
  // 回退
  RollbackResult,
  // 执行记录
  NodeExecution,
} from './artifacts.js'
