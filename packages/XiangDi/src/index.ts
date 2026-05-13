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
  // 状态
  AgentState,
  AgentStatus,
  // 流式事件
  StreamEvent,
  StreamCallback,
  TypedStreamEvent,
  TextDeltaEvent,
  ToolCallEvent,
  ToolResultEvent,
  DoneEvent,
  ErrorEvent,
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
  BANVAS_TOOLS,
  BANVAS_TOOL_DEFINITIONS,
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
} from "./tools/index.js";

// ─── 提示词 ───────────────────────────────────────────────────────────────────
export {
  XIANGDI_SYSTEM_PROMPT,
  buildSystemPrompt,
  getAllFewshots,
  flattenFewshots,
  FEWSHOT_CREATE_LOGIN_PAGE,
} from "./prompts/index.js";

// ─── 版本 ─────────────────────────────────────────────────────────────────────
declare const __XIANGDI_VERSION__: string;
export const VERSION: string =
  typeof __XIANGDI_VERSION__ !== "undefined" ? __XIANGDI_VERSION__ : "0.1.0";
