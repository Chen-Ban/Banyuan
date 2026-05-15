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
  AgentLoop,
  ToolRegistry,
  ContextManager,
  StreamBridge,
  AgentLifecycle,
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
  // 生命周期状态机
  AgentPhase,
  AgentStep,
  LifecycleEvent,
  LifecycleEventDetail,
  AgentStateSnapshot,
  LifecycleListener,
  // 流式事件
  StreamEvent,
  StreamCallback,
  TypedStreamEvent,
  TextDeltaEvent,
  ToolCallEvent,
  ToolResultEvent,
  DoneEvent,
  ErrorEvent,
  LifecycleStreamEvent,
  // LLM 客户端接口
  LLMClient,
  LLMResponse,
} from "./core/index.js";

// ─── Schema 层 ────────────────────────────────────────────────────────────────
export {
  // Zod Schema
  AIAppSchema,
  AIPageSchema,
  AINodeSchema,
  AIRectNodeSchema,
  AITextNodeSchema,
  AIImageNodeSchema,
  AIGroupNodeSchema,
  AITransformSchema,
  AIFillSchema,
  AIStrokeSchema,
  AITextStyleSchema,
  AIColorSchema,
  AIPositionSchema,
  AISizeSchema,
  // 转换器
  aiAppToBanvas,
  banvasToAIApp,
} from "./schema/index.js";

export type { AIApp, AIPage, AINode } from "./schema/index.js";

// ─── 工具协议 ─────────────────────────────────────────────────────────────────
export {
  // Banvas 画布工具
  BANVAS_TOOLS,
  BANVAS_TOOL_DEFINITIONS,
  // Banvas 工具 Handler 工厂
  createBanvasToolRegistry,
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
} from "./tools/index.js";

// ─── 提示词 ───────────────────────────────────────────────────────────────────
export {
  XIANGDI_SYSTEM_PROMPT,
  buildSystemPrompt,
  getAllFewshots,
  flattenFewshots,
  FEWSHOT_CREATE_LOGIN_PAGE,
} from "./prompts/index.js";

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
  ChangeStatus,
  ChangeTask,
  ChangeSpec,
  ChangeSpecStore,
  // SpecPlanner 类型
  SpecPlannerConfig,
  PlanResult,
} from "./spec/index.js";

// ─── Harness 层（约束 + 反馈回路 + 人工介入）────────────────────────────────
export {
  HarnessRunner,
  Guards,
  Checkpoints,
  HumanGates,
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
  reviewProposal,
  reviewTasks,
  confirmResult,
  retryOnError,
} from "./harness/index.js";

export type {
  GuardResult,
  GuardFn,
  Guard,
  CheckpointResult,
  CheckpointFn,
  Checkpoint,
  HumanGateTrigger,
  HumanGate,
  HumanDecision,
  HarnessContext,
  HarnessPhase,
  HarnessConfig,
  HarnessRunResult,
} from "./harness/index.js";

// ─── Knowledge 层（RAG + GraphRAG 混合检索）──────────────────────────────────
export {
  MemoryKnowledgeStore,
  HybridKnowledgeStore,
  // 生产级实现
  LanceDBVectorStore,
  TransformersEmbeddingProvider,
  GraphologyGraphStore,
  // 兼容/测试用
  InMemoryGraphStore,
  LLMRetrievalRouter,
  RuleBasedRouter,
} from "./knowledge/index.js";

export type {
  // 基础检索
  KnowledgeChunk,
  KnowledgeStore,
  KnowledgeQueryOptions,
  KnowledgeEntry,
  MutableKnowledgeStore,
  // 向量检索
  EmbeddingProvider,
  VectorStore,
  VectorItem,
  VectorSearchResult,
  // 图检索（GraphRAG）
  GraphEntity,
  GraphRelation,
  SubGraph,
  GraphKnowledgeStore,
  GraphQueryOptions,
  ImpactAnalysisOptions,
  // 混合检索路由
  RetrievalStrategy,
  RoutingDecision,
  HybridStoreConfig,
  RetrievalRouter,
  RouterContext,
  RetrievalRouterConfig,
  // 生产级实现配置
  HybridKnowledgeStoreConfig,
  LanceDBVectorStoreConfig,
  GraphologyGraphStoreConfig,
} from "./knowledge/index.js";

// ─── LLM 层（DeepSeek 客户端 + 智能路由）─────────────────────────────────────
export { DeepSeekClient, loadApiKeyFromFile, LLMRouter } from "./llm/index.js";
export type {
  DeepSeekConfig,
  LLMRouterConfig,
  LLMProvider,
  ProviderHealth,
  RoutingSignal,
  RoutingSignalType,
  SuggestedAction,
  SignalListener,
} from "./llm/index.js";

// ─── Memory 层（中期记忆 + 长期记忆）─────────────────────────────────────────
export {
  LocalEpisodicMemory,
  LocalSemanticMemory,
  DefaultMemoryManager,
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
} from "./memory/index.js";

// ─── 版本 ─────────────────────────────────────────────────────────────────────
declare const __XIANGDI_VERSION__: string;
export const VERSION: string =
  typeof __XIANGDI_VERSION__ !== "undefined" ? __XIANGDI_VERSION__ : "0.1.0";
