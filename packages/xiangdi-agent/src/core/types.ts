/**
 * 相地 · 核心类型定义
 *
 * 相地者，园林营造之首务。
 * 此处定义 Agent 感知、规划、行动的基础契约。
 */

// ─── LLM 消息协议 ────────────────────────────────────────────────────────────

export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface TextContent {
  type: "text";
  text: string;
}

export interface ImageContent {
  type: "image";
  /** base64 编码的图片数据 */
  data: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
}

export interface ToolUseContent {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultContent {
  type: "tool_result";
  tool_use_id: string;
  content: string | TextContent[];
  is_error?: boolean;
}

export type MessageContent =
  | string
  | TextContent
  | ImageContent
  | ToolUseContent
  | ToolResultContent
  | (TextContent | ImageContent | ToolUseContent | ToolResultContent)[];

export interface Message {
  role: MessageRole;
  content: MessageContent;
}

// ─── Tool 定义 ────────────────────────────────────────────────────────────────

export interface ToolInputSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: ToolInputSchema;
}

export type ToolHandler<TInput = Record<string, unknown>, TOutput = unknown> = (
  input: TInput
) => Promise<TOutput>;

export interface RegisteredTool<
  TInput = Record<string, unknown>,
  TOutput = unknown,
> {
  definition: ToolDefinition;
  handler: ToolHandler<TInput, TOutput>;
}

// ─── Agent 配置 ───────────────────────────────────────────────────────────────

export interface LLMConfig {
  /** 模型标识，如 "deepseek-v4-pro" */
  model: string;
  /** API 基础 URL */
  baseURL?: string;
  /** 最大 token 数 */
  maxTokens?: number;
  /** 温度，0-1 */
  temperature?: number;
}

export interface AgentConfig {
  llm: LLMConfig;
  /** 最大循环轮次，防止无限循环 */
  maxIterations?: number;
  /** 系统提示词 */
  systemPrompt?: string;
}

// ─── 流式事件（Legacy，仅保留基础类型供兼容）──────────────────────────────────

export type StreamEventType =
  | "text_delta"
  | "tool_call"
  | "tool_result"
  | "done"
  | "error"
  | "round_summary"
  | "memory_update";

export interface StreamEvent {
  type: StreamEventType;
  data: unknown;
}

export interface TextDeltaEvent extends StreamEvent {
  type: "text_delta";
  data: { text: string };
}

export interface ToolCallEvent extends StreamEvent {
  type: "tool_call";
  data: { id: string; name: string; input: Record<string, unknown> };
}

export interface ToolResultEvent extends StreamEvent {
  type: "tool_result";
  data: { tool_use_id: string; name: string; result: unknown; is_error: boolean };
}

export interface DoneEvent extends StreamEvent {
  type: "done";
  data: { finalMessage: string };
}

export interface ErrorEvent extends StreamEvent {
  type: "error";
  data: { error: Error };
}

/** 轮次摘要事件（summarize 节点产出整轮摘要后发出） */
export interface RoundSummaryEvent extends StreamEvent {
  type: "round_summary";
  data: { summary: string };
}

/** 记忆更新事件（extractMemory 节点提取经验/事实后发出） */
export interface MemoryUpdateEvent extends StreamEvent {
  type: "memory_update";
  data: {
    episode: {
      title: string;
      content: string;
      outcome: "success" | "failure" | "partial" | "aborted";
      lessons: string[];
      involvedEntities: string[];
      tags: string[];
      importance: number;
    } | null;
    facts: Array<{
      category: string;
      content: string;
      confidence: number;
    }>;
  };
}

export type TypedStreamEvent =
  | TextDeltaEvent
  | ToolCallEvent
  | ToolResultEvent
  | DoneEvent
  | ErrorEvent
  | RoundSummaryEvent
  | MemoryUpdateEvent;

export type StreamCallback = (event: TypedStreamEvent) => void;
