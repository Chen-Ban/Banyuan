/**
 * 相地（XiangDi）
 *
 * 《园冶》有云："相地合宜，构园得体。"
 * 造园之始，先察山川形势，方能因地制宜，布局得当。
 *
 * XiangDi 是 Banyuan 的 AI Agent 引擎：
 * 感知设计意图（设计稿 + 自然语言）→ 规划生成路径 → 驱动 BanvasGL 画布生长。
 *
 * @packageDocumentation
 */

// ─── 核心引擎 ─────────────────────────────────────────────────────────────────
export { ToolRegistry } from "./core/index.js";

export type {
  // 消息协议
  Message,
  MessageRole,
  MessageContent,
  TextContent,
  ImageContent,
  ToolUseContent,
  ToolResultContent,
  // 工具
  ToolDefinition,
  ToolHandler,
  RegisteredTool,
  // 配置
  LLMConfig,
  AgentConfig,
  // 流式事件
  StreamEvent,
  StreamCallback,
  StreamEventType,
  TypedStreamEvent,
  TextDeltaEvent,
  ToolCallEvent,
  ToolResultEvent,
  DoneEvent,
  ErrorEvent,
  RoundSummaryEvent,
  MemoryUpdateEvent,
  // LLM 客户端接口
  LLMClient,
  LLMResponse,
} from "./core/index.js";

// ─── Schema 层（AI Projection，ADR-027）─────────────────────────────────────
export {
  toAIProjection,
  fromAIProjection,
  uiJSONToProjection,
  projectionToUIJSON,
  // Patch Projection（ADR-041）
  patchProjection,
  patchProjectionViaAdapter,
} from "./schema/index.js";

export type {
  // App 级投影
  AIProjectionApp,
  AIAppLifetimes,
  // Scene / Node 级投影
  AIProjectionScene,
  AIProjectionNode,
  AIProjectionNodeBase,
  AITransform,
  AISize,
  AIDecoration,
  AIEvents,
  AILifetimes,
  AIDataModel,
  AILayoutMode,
  AIFlexLayout,
  AIListLayout,
  AIGridLayout,
  AIGraphViewNode,
  AITextViewNode,
  AIImageViewNode,
  AIVideoViewNode,
  AICombinedViewNode,
  AINodeViewNode,
  AIEdgeViewNode,
  AIPortViewNode,
  AIGenericViewNode,
  // Patch Projection（ADR-041）
  PatchProjectionInput,
  PatchProjectionResult,
} from "./schema/index.js";

// ─── 提示词 ───────────────────────────────────────────────────────────────────
export {
  XIANGDI_SYSTEM_PROMPT,
  buildSystemPrompt,
  generateNodeSchemaDoc,
} from "./prompts/index.js";

export type { BuildSystemPromptOptions } from "./prompts/index.js";

// ─── 工具依赖注入接口 ─────────────────────────────────────────────────────────
export type {
  MaterialStore,
  MaterialSummary,
  MaterialDetail,
} from "./tools-types.js";

// ─── Knowledge 层（接口类型） ────────────────────────────────────────────────
export type {
  KnowledgeChunk,
  KnowledgeStore,
  KnowledgeQueryOptions,
  KnowledgeEntry,
  MutableKnowledgeStore,
  GraphEntity,
  GraphRelation,
  SubGraph,
  GraphKnowledgeStore,
  GraphQueryOptions,
  ImpactAnalysisOptions,
} from "./knowledge/types.js";

// ─── LLM 层（DeepSeek + Kimi 客户端 + 智能路由）──────────────────────────────
export { DeepSeekClient, KimiClient, LLMRouter } from "./llm/index.js";
export type {
  DeepSeekConfig,
  KimiConfig,
  LLMRouterConfig,
  LLMProvider,
  ProviderHealth,
  RoutingSignal,
  RoutingSignalType,
  SuggestedAction,
  SignalListener,
} from "./llm/index.js";

// ─── 编排层（ADR-041: Orchestrator + 领域 SubAgent 统一管线）────────────────
export {
  // Orchestrator 主图
  OrchestratorStateAnnotation,
  createOrchestratorGraph,
  // SubAgent 协议
  SUBAGENT_NAMES,
  SUBAGENT_DEPENDENCIES,
  SUBAGENT_TOPO_ORDER,
  getDependents,
  canRunInParallel,
  // Dialogue Phase 状态机
  DIALOGUE_PHASES,
  PHASE_TRANSITIONS,
  PHASE_METADATA,
  canTransition,
  getPhaseIndex,
  isTerminal,
  isRollback,
  // 节点工厂
  callSubAgentLLM,
  parseWithRetry,
  buildExecution,
  emitProgress,
  createIntentNode as createOrchestratorIntentNode,
  createRespondNode as createOrchestratorRespondNode,
  createRequirementsNode,
  createUIDesignNode,
  createContractNode,
  createFrontendNode as createOrchestratorFrontendNode,
  createBackendNode,
  createAuditNode,
  createRollbackNode,
  createCommitNode,
  createSummarizeNode,
  // Worker SubGraph
  createWorkerGraph,
  extractFinalText,
  createFrontendToolRegistry,
  createBackendToolRegistry,
  // SubAgent 结构化输出 Zod Schemas（运行时验证）
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
} from "./orchestration/index.js";

export type {
  // Orchestrator 主图类型
  OrchestratorMode,
  OrchestratorState,
  OrchestratorGraphConfig,
  // SubAgent 协议
  SubAgentName,
  SubAgentDescriptor,
  SubAgentInput,
  SubAgentOutput,
  SubAgentMetadata,
  SubAgentErrorPhase,
  SubAgentError,
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
  // Dialogue Phase 类型
  DialoguePhase,
  PhaseMetadata,
  // SSE 事件类型
  PhaseChangeEvent,
  AgentProgressStatus,
  AgentProgressEvent,
  ToolActivityStatus,
  ToolActivityEvent,
  AuditProgressStatus,
  AuditProgressEvent,
  TextDeltaEvent as OrchestratorTextDeltaEvent,
  DoneArtifactsOverview,
  DoneSSEEvent,
  OrchestratorSSEEvent,
  OrchestratorSSECallback,
  // 节点工厂类型
  SubAgentLLMCallConfig,
  ParseWithRetryConfig,
  ParseResult,
  AuditNodeConfig,
  RollbackNodeConfig,
  CommitNodeConfig,
  SummarizeNodeConfig,
  WorkerGraphConfig,
  WorkerState,
  FrontendToolHandlers,
  BackendToolHandlers,
  // SubAgent 结构化输出类型
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
} from "./orchestration/index.js";

// ─── 版本 ─────────────────────────────────────────────────────────────────────
declare const __XIANGDI_VERSION__: string;
export const VERSION: string =
  typeof __XIANGDI_VERSION__ !== "undefined" ? __XIANGDI_VERSION__ : "0.1.0";
