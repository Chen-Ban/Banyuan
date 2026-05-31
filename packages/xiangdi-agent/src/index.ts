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
export {
  ToolRegistry,
  ConflictDetector,
  DecisionLog,
  DisambiguationHandler,
} from "./core/index.js";

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
  DisambiguationEvent,
  DisambiguationPendingEvent,
  RoundSummaryEvent,
  MemoryUpdateEvent,
  PlanningProgressStreamEvent,
  ResumeClarificationStreamEvent,
  // LLM 客户端接口
  LLMClient,
  LLMResponse,
  // 冲突检测
  DisambiguationPending,
  Decision,
  DecisionScope,
  DecisionSource,
  ConflictType,
  ConflictItem,
  ConflictReport,
  // 消歧处理
  DisambiguationOption,
  DisambiguationOptions,
} from "./core/index.js";

// ─── Graph Module (LangGraph) ────────────────────────────────────────────────
export {
  MasterStateAnnotation,
  ExecuteStateAnnotation,
  createMasterGraph,
  createChatGraph,
  ChatStateAnnotation,
  buildSpecSystemPrompt,
  loadSpecPrompt,
  createExtractMemoryNode,
  // Multi-Agent Planning (ADR-032/033/034)
  PlanningOrchestrator,
  runSubAgent,
  runPMAgent,
  runArchAgent,
  runVisualAgent,
  runTaskPlannerAgent,
  buildPMContext,
  buildArchContext,
  buildVisualContext,
  buildTaskContext,
  buildContextSummary,
  // Resume (ADR-034)
  PLANNING_DAG,
  getDownstream,
  getDirectDownstream,
  getValidArtifacts,
  getResumeStartAgent,
  getInvalidatedAgents,
  classifyResumeIntent,
  handleContinue,
  handleRefine,
  handleRestart,
  handleClarify,
} from "./graph/index.js";
export type {
  MasterState,
  ExecuteState,
  PlanTask,
  PlanOutput,
  MasterGraphConfig,
  ChatGraphConfig,
  ChatState,
  SpecNodeConfig,
  ExtractMemoryConfig,
  MemoryNodeState,
  // Multi-Agent Planning types
  PlanningOrchestratorConfig,
  PlanningResult,
  PlanningRunOptions,
  SubAgentConfig,
  SubAgentRunResult,
  SubAgentLLMConfig,
  SubAgentState,
  PMAgentInput,
  PMAgentConfig,
  ArchAgentInput,
  ArchAgentConfig,
  VisualAgentInput,
  VisualAgentConfig,
  TaskPlannerInput,
  TaskPlannerAgentConfig,
  TokenBudget,
  // Resume types
  ResumeIntent,
  ResumeClassification,
  CompletedArtifactEntry,
  CompletedArtifacts,
  PartialAgentState,
  PlanningSnapshot,
  RefinementContext,
  PlanningArtifactStatus,
  ResumeClassifierConfig,
  ResumeClassifierInput,
} from "./graph/index.js";

// ─── Schema 层（AI Projection，ADR-027）─────────────────────────────────────
export {
toAIProjection,
fromAIProjection,
appJSONToProjection,
projectionToAppJSON,
} from "./schema/index.js";

export type {
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
} from "./schema/index.js";

// ─── 工具协议 ─────────────────────────────────────────────────────────────────
export {
  // Banvas 画布工具
  BANVAS_TOOLS,
  BANVAS_TOOL_DEFINITIONS,
  // Banvas 工具 Handler 工厂
  createBanvasToolRegistry,
  // AI Projection 读写（ADR-027）
  readProjection,
  writeProjection,
  // Web Search 内置工具
  WEB_SEARCH_TOOL_NAME,
  WEB_SEARCH_TOOL_DEFINITION,
  createWebSearchHandler,
  registerWebSearchTool,
  // Knowledge Search 内置工具
  KNOWLEDGE_SEARCH_TOOL_NAME,
  KNOWLEDGE_SEARCH_TOOL_DEFINITION,
  createKnowledgeSearchHandler,
  registerKnowledgeSearchTool,
  // Cloud Function 云函数工具
  GENERATE_CLOUD_FUNCTION_TOOL_NAME,
  GENERATE_CLOUD_FUNCTION_TOOL_DEFINITION,
  UPDATE_CLOUD_FUNCTION_TOOL_NAME,
  UPDATE_CLOUD_FUNCTION_TOOL_DEFINITION,
  EXPLAIN_CLOUD_FUNCTION_TOOL_NAME,
  EXPLAIN_CLOUD_FUNCTION_TOOL_DEFINITION,
  createGenerateCloudFunctionHandler,
  createUpdateCloudFunctionHandler,
  createExplainCloudFunctionHandler,
  registerCloudFunctionTools,
  // Schema 工具
  SCHEMA_GET_TOOL_NAME,
  SCHEMA_GET_TOOL_DEFINITION,
  SCHEMA_SET_COLLECTIONS_TOOL_NAME,
  SCHEMA_SET_COLLECTIONS_TOOL_DEFINITION,
  createSchemaGetHandler,
  createSchemaSetCollectionsHandler,
  registerSchemaTools,
  // Material 物料工具
  MATERIAL_SEARCH_TOOL_NAME,
  MATERIAL_SEARCH_TOOL_DEFINITION,
  MATERIAL_GET_DETAIL_TOOL_NAME,
  MATERIAL_GET_DETAIL_TOOL_DEFINITION,
  createMaterialSearchHandler,
  createMaterialGetDetailHandler,
  registerMaterialTools,
} from "./tools/index.js";

export type {
  BanvasToolName,
  GetAppStateInput,
  CreatePageInput,
  AddNodeInput,
  UpdateNodeInput,
  DeleteNodeInput,
  MoveNodeInput,
  ResizeNodeInput,
  ApplyPatchInput,
  // Banvas 工具 Handler 工厂类型
  BanvasHostAdapter,
  // Web Search 类型
  SearchResult,
  SearchResponse,
  SearchProvider,
  SearchOptions,
  WebSearchInput,
  WebSearchOutput,
  // Knowledge Search 类型
  KnowledgeSearchInput,
  KnowledgeSearchOutput,
  // Cloud Function 云函数工具类型
  AppSchemaFieldDef,
  AppSchemaCollectionDef,
  GenerateCloudFunctionInput,
  GenerateCloudFunctionOutput,
  UpdateCloudFunctionInput,
  UpdateCloudFunctionOutput,
  ExplainCloudFunctionInput,
  ExplainCloudFunctionOutput,
  CloudFunctionToolsConfig,
  // Schema 工具类型
  SchemaFieldType,
  SchemaFieldDef,
  SchemaCollectionDef,
  AppSchemaSnapshot,
  SchemaWriter,
  SchemaReader,
  SchemaGetInput,
  SchemaGetOutput,
  SchemaSetCollectionsInput,
  SchemaSetCollectionsOutput,
  SchemaToolsConfig,
  // Material 物料工具类型
  MaterialStore,
  MaterialSummary,
  MaterialDetail,
  MaterialSearchInput,
  MaterialSearchOutput,
  MaterialGetDetailInput,
  MaterialGetDetailOutput,
} from "./tools/index.js";

// ─── 提示词 ───────────────────────────────────────────────────────────────────
export {
  XIANGDI_SYSTEM_PROMPT,
  buildSystemPrompt,
  generateAISchemaDoc,
  generateNodeSchemaDoc,
  getAllFewshots,
  flattenFewshots,
  FEWSHOT_CREATE_LOGIN_PAGE,
  // Multi-Agent Prompts
  DEFAULT_AGENT_PROMPTS,
  getAgentPrompt,
  getAgentPromptVersions,
} from "./prompts/index.js";

export type { BuildSystemPromptOptions, AgentPromptEntry } from "./prompts/index.js";

// ─── Spec 层（SDD 两层规范）──────────────────────────────────────────────────
export {
  // ProjectSpec（项目级规范）
  FileProjectSpecLoader,
  InlineProjectSpecLoader,
  parseProjectSpec,
  DEFAULT_SPEC_FILE_CANDIDATES,
  // ChangeSpec（变更级过程文件）
  ChangeSpecBuilder,
  MemoryChangeSpecStore,
  // SpecPlanner（LLM 自动生成 ChangeSpec）
  SpecPlanner,
} from "./spec/index.js";

export type {
  ProjectSpecRaw,
  ProjectSpec,
  ProjectSpecLoader,
  AppSchemaField,
  AppSchemaCollection,
  ChangeStatus,
  ChangeTask,
  ChangeSpec,
  ChangeSpecStore,
  // SpecPlanner 类型
  SpecPlannerConfig,
  PlanResult,
  // Multi-Agent Planning 类型 (ADR-032)
  AgentRole,
  Feature,
  FeatureDependency,
  FeatureList,
  ViewChange,
  SchemaChange,
  TechPlan,
  PageVisualSpec,
  DesignTokens,
  ComponentChoice,
  VisualSpec,
  PlanningProgressEvent,
} from "./spec/index.js";

// ─── Harness 层（约束 + 反馈回路）────────────────────────────────────────────
export {
  Guards,
  Checkpoints,
  specApproved,
  hasAtLeastOneTask,
  noProhibitedKeywords,
  proposalComplete,
  customGuard,
  outputNotEmpty,
  outputMatchesPattern,
  allTasksDone,
  outputMinLength,
  customCheckpoint,
} from "./harness/index.js";

export type {
  GuardResult,
  GuardFn,
  Guard,
  CheckpointResult,
  CheckpointFn,
  Checkpoint,
  HarnessContext,
  HarnessPhase,
  HarnessConfig,
  HarnessRunResult,
} from "./harness/index.js";

// ─── Knowledge 层（RAG + GraphRAG + Embedding）──────────────────────────────
export {
  // 公共 Embedding 服务（本地 ONNX 推理，384 维）
  EmbeddingService,
  EMBEDDING_DIMENSIONS,
  // 生产推荐：向量 + BM25 混合检索，本地持久化
  LanceDBKnowledgeStore,
  // 测试/小数据量：关键词匹配
  MemoryKnowledgeStore,
  // GraphRAG：关系推理、影响分析
  GraphologyGraphStore,
  // 检索路由器（GraphRAG 场景）
  LLMRetrievalRouter,
  RuleBasedRouter,
  // 种子数据工具
  seedToEntry,
  seedsToEntries,
} from "./knowledge/index.js";

export type {
  EmbeddingServiceConfig,
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
  LanceDBKnowledgeStoreConfig,
  GraphologyGraphStoreConfig,
  RetrievalRouterConfig,
  SeedCategory,
  SeedFile,
} from "./knowledge/index.js";

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

// ─── Memory 层（中期记忆 + 长期记忆 + 命名空间）──────────────────────────────
export {
  LocalEpisodicMemory,
  LocalSemanticMemory,
  DefaultMemoryManager,
  // 命名空间记忆 (ADR-033)
  NamespacedMemoryManager,
  createMemoryManager,
  SharedMemoryWriter,
} from "./memory/index.js";

export type {
  // 中期记忆
  Episode,
  EpisodeOutcome,
  EpisodicMemory,
  EpisodicRecallOptions,
  ConsolidateOptions,
  // 长期记忆
  Fact,
  FactCategory,
  SemanticMemory,
  SemanticRecallOptions,
  // 管理器
  MemoryManager,
  LocalEpisodicMemoryConfig,
  LocalSemanticMemoryConfig,
  DefaultMemoryManagerConfig,
  // 命名空间记忆 (ADR-033)
  MemoryNamespace,
  NamespacedMemoryManagerConfig,
} from "./memory/index.js";

// ─── 编排层（类型定义）────────────────────────────────────────────────
export { DEFAULT_ORCHESTRATION_CONFIG } from "./orchestration/index.js";

export type {
  // Port 系统
  PortDirection,
  PortDataType,
  DataPort,
  EventPort,
  ContainerPorts,
  // SubAgent 任务
  ContainerRole,
  SubAgentTask,
  SubAgentConstraints,
  SubAgentContext,
  FlowFragment,
  SubAgentResult,
  DataUsageDeclaration,
  // 组装
  ContainerPlacement,
  DataBinding,
  EventWiring,
  AssemblyPlan,
  // 审计
  AuditSeverity,
  AuditIssue,
  AuditRequest,
  AuditResult,
  // 配置与事件
  OrchestrationConfig,
  OrchestrationPhase,
  OrchestrationProgressEvent,
  OrchestrationResult,
} from "./orchestration/index.js";

// ─── 版本 ─────────────────────────────────────────────────────────────────────
declare const __XIANGDI_VERSION__: string;
export const VERSION: string =
  typeof __XIANGDI_VERSION__ !== "undefined" ? __XIANGDI_VERSION__ : "0.1.0";
