/**
 * 相地 · 编排层
 *
 * ADR-041: Orchestrator + 领域 SubAgent 统一管线
 */

// ─── 新协议（ADR-041）────────────────────────────────────────────────────────

export {
  // SubAgent 协议常量与工具函数
  SUBAGENT_NAMES,
  SUBAGENT_DEPENDENCIES,
  SUBAGENT_TOPO_ORDER,
  getDependents,
  canRunInParallel,
} from './protocol.js'

export type {
  // SubAgent 协议类型
  SubAgentName,
  SubAgentDescriptor,
  SubAgentInput,
  SubAgentOutput,
  SubAgentMetadata,
  SubAgentErrorPhase,
  SubAgentError,
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

// ─── SubAgent 结构化输出 Schema（ADR-041 步骤 1.2）──────────────────────────

export {
  // Zod Schemas（运行时验证用）
  FeatureSchema,
  StructuredRequirementsSchema,
  ComponentSpecSchema,
  InteractionSpecSchema,
  PageSpecSchema,
  NavigationFlowSchema,
  DesignTokenOverridesSchema,
  UIDesignSpecSchema,
  FieldContractSchema,
  CollectionContractSchema,
  ParamContractSchema,
  SideEffectSchema,
  FunctionContractSchema,
  ParamMappingSchema,
  BindingContractSchema,
  IntegrationContractSchema,
  FlowSchemaZod,
  ClientFlowBindingSchema,
  AIProjectionSceneZod,
  AIProjectionAppZod,
  PageArtifactSchema,
  FrontendArtifactsSchema,
  CollectionFieldSchema,
  IndexDefinitionSchema,
  CollectionDefinitionSchema,
  CloudFunctionEntrySchema,
  BackendArtifactsSchema,
} from './schemas.js'

export type {
  // TypeScript 类型（z.infer 派生）
  Feature,
  StructuredRequirements,
  ComponentSpec,
  InteractionSpec,
  PageSpec,
  NavigationFlow,
  DesignTokenOverrides,
  UIDesignSpec,
  FieldContract,
  CollectionContract,
  ParamContract,
  SideEffect,
  FunctionContract,
  ParamMapping,
  BindingContract,
  IntegrationContract,
  ClientFlowBinding,
  PageArtifact,
  FrontendArtifacts,
  CollectionField,
  IndexDefinition,
  CollectionDefinition,
  CloudFunctionEntry,
  BackendArtifacts,
} from './schemas.js'

// ─── Dialogue Phase 状态机（ADR-041 步骤 1.3）────────────────────────────────

export {
  DIALOGUE_PHASES,
  PHASE_TRANSITIONS,
  PHASE_METADATA,
  canTransition,
  getPhaseIndex,
  isTerminal,
  isRollback,
} from './phases.js'

export type { DialoguePhase, PhaseMetadata } from './phases.js'

// ─── 节点工厂（ADR-041 步骤 2.2~2.4）─────────────────────────────────────────

export {
  // 共享工具
  callSubAgentLLM,
  parseWithRetry,
  buildExecution,
  emitProgress,
  // 节点工厂
  createIntentNode,
  createRespondNode,
  createRequirementsNode,
  createUIDesignNode,
  createContractNode,
  createFrontendNode,
  createBackendNode,
  createAuditNode,
  createRollbackNode,
  createCommitNode,
  createSummarizeNode,
  // Worker SubGraph
  createWorkerGraph,
  extractFinalText,
  // Worker 工具注册
  createFrontendToolRegistry,
  createBackendToolRegistry,
} from './nodes/index.js'

export type {
  SubAgentLLMCallConfig,
  ParseWithRetryConfig,
  ParseResult,
  IntentNodeConfig,
  RespondNodeConfig,
  RequirementsNodeConfig,
  UIDesignNodeConfig,
  ContractNodeConfig,
  FrontendNodeConfig,
  BackendNodeConfig,
  AuditNodeConfig,
  RollbackNodeConfig,
  CommitNodeConfig,
  SummarizeNodeConfig,
  // Worker SubGraph
  WorkerGraphConfig,
  WorkerState,
  // Worker 工具
  FrontendToolHandlers,
  BackendToolHandlers,
} from './nodes/index.js'

// ─── Orchestrator 主图（ADR-041 步骤 2.1）────────────────────────────────────

export { OrchestratorStateAnnotation, createOrchestratorGraph } from './orchestratorGraph.js'

export type { OrchestratorMode, OrchestratorState, OrchestratorGraphConfig } from './orchestratorGraph.js'

// ─── SSE 事件类型（ADR-041 步骤 1.4）─────────────────────────────────────────

export type {
  PhaseChangeEvent,
  AgentProgressStatus,
  AgentProgressEvent,
  ToolActivityStatus,
  ToolActivityEvent,
  AuditProgressStatus,
  AuditProgressEvent,
  TextDeltaEvent,
  DoneArtifactsOverview,
  DoneSSEEvent,
  OrchestratorSSEEvent,
  OrchestratorSSECallback,
} from './events.js'
