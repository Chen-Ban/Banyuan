/**
 * 相地 · DeepSeek LLM 客户端
 *
 * 基于 DeepSeek 开放 API 的 LLMClient 实现。
 * DeepSeek 使用 OpenAI 兼容协议，本客户端将其适配为 XiangDi 的 LLMClient 接口
 * （Anthropic 风格的 createMessage + stop_reason + content[]）。
 *
 * 使用示例：
 * ```ts
 * import { DeepSeekClient } from "xiangdi";
 *
 * const client = new DeepSeekClient({
 *   apiKey: "sk-xxx",
 *   model: "deepseek-chat",
 * });
 *
 * // 直接用于 AgentLoop
 * const loop = new AgentLoop(config);
 * const result = await loop.run(client, "创建一个登录页");
 * ```
 */

import type { LLMClient, LLMResponse } from "../core/AgentLoop.js";
import type { Message } from "../core/types.js";

// ─── 配置 ──────────────────────────────────────────────────────────────────────

export interface DeepSeekConfig {
  /** API Key */
  apiKey: string;
  /** 模型名称，默认 "deepseek-chat"（也可用 "deepseek-reasoner"） */
  model?: string;
  /** API 基础 URL，默认 "https://api.deepseek.com" */
  baseUrl?: string;
  /** 请求超时（毫秒），默认 120000 */
  timeout?: number;
}

// ─── DeepSeekClient ────────────────────────────────────────────────────────────

/**
 * DeepSeek LLM 客户端
 *
 * 实现 XiangDi 的 LLMClient 接口（createMessage），
 * 内部调用 DeepSeek OpenAI-compatible API 并将响应转换为 Anthropic 格式。
 */
export class DeepSeekClient implements LLMClient {
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor(config: DeepSeekConfig) {
    this.apiKey = config.apiKey;
    this.defaultModel = config.model ?? "deepseek-chat";
    this.baseUrl = config.baseUrl ?? "https://api.deepseek.com";
    this.timeout = config.timeout ?? 120_000;
  }

  async createMessage(params: {
    model: string;
    max_tokens: number;
    system?: string;
    messages: Message[];
    tools?: unknown[];
    temperature?: number;
  }): Promise<LLMResponse> {
    const url = `${this.baseUrl}/v1/chat/completions`;

    // 将 Anthropic 风格的参数转为 OpenAI 兼容格式
    const openAIMessages = buildOpenAIMessages(params.system, params.messages);

    const body: Record<string, unknown> = {
      model: params.model || this.defaultModel,
      messages: openAIMessages,
      max_tokens: params.max_tokens,
      temperature: params.temperature ?? 0.7,
    };

    // 工具调用支持（OpenAI function calling 格式）
    if (params.tools && params.tools.length > 0) {
      body.tools = convertToOpenAITools(params.tools);
      body.tool_choice = "auto";
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(
          `DeepSeek API error (${response.status}): ${errorText}`
        );
      }

      const data = (await response.json()) as OpenAIChatResponse;
      return convertToAnthropicResponse(data);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// ─── 辅助：加载 API Key ────────────────────────────────────────────────────────

/**
 * 从 JSON 文件加载 API Key
 *
 * @param filePath JSON 文件路径（{ "key": "sk-xxx" } 或 { "apiKey": "sk-xxx" }）
 * @returns API Key 字符串
 */
export async function loadApiKeyFromFile(filePath: string): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  const content = await readFile(filePath, "utf-8");
  const parsed = JSON.parse(content) as { key?: string; apiKey?: string };
  const key = parsed.key ?? parsed.apiKey;
  if (!key) {
    throw new Error(`No API key found in ${filePath}`);
  }
  return key;
}

// ─── 格式转换：XiangDi Message → OpenAI Message ───────────────────────────────

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

function buildOpenAIMessages(
  system: string | undefined,
  messages: Message[]
): OpenAIMessage[] {
  const result: OpenAIMessage[] = [];

  // system prompt 作为第一条 system 消息
  if (system) {
    result.push({ role: "system", content: system });
  }

  for (const msg of messages) {
    if (msg.role === "user") {
      result.push({ role: "user", content: extractTextContent(msg.content) });
    } else if (msg.role === "assistant") {
      const openAIMsg = convertAssistantMessage(msg.content);
      result.push(openAIMsg);
    } else if (msg.role === "tool") {
      // tool_result 消息
      const content = extractTextContent(msg.content);
      result.push({
        role: "tool",
        content,
        tool_call_id: extractToolCallId(msg.content),
      });
    }
  }

  return result;
}

function extractTextContent(content: Message["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (part.type === "text") return part.text;
      if (part.type === "tool_result") return part.content ?? "";
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function extractToolCallId(content: Message["content"]): string {
  if (!Array.isArray(content)) return "";
  for (const part of content) {
    if (part.type === "tool_result" && part.tool_use_id) {
      return part.tool_use_id;
    }
  }
  return "";
}

function convertAssistantMessage(content: Message["content"]): OpenAIMessage {
  if (typeof content === "string") {
    return { role: "assistant", content };
  }
  if (!Array.isArray(content)) {
    return { role: "assistant", content: "" };
  }

  const textParts: string[] = [];
  const toolCalls: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }> = [];

  for (const part of content) {
    if (part.type === "text") {
      textParts.push(part.text);
    } else if (part.type === "tool_use") {
      toolCalls.push({
        id: part.id,
        type: "function",
        function: {
          name: part.name,
          arguments: JSON.stringify(part.input),
        },
      });
    }
  }

  const msg: OpenAIMessage = {
    role: "assistant",
    content: textParts.length > 0 ? textParts.join("\n") : null,
  };

  if (toolCalls.length > 0) {
    msg.tool_calls = toolCalls;
  }

  return msg;
}

// ─── 格式转换：OpenAI Response → Anthropic LLMResponse ────────────────────────

interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

function convertToAnthropicResponse(data: OpenAIChatResponse): LLMResponse {
  const choice = data.choices?.[0];
  if (!choice) {
    return { stop_reason: "end_turn", content: [{ type: "text", text: "" }] };
  }

  const content: LLMResponse["content"] = [];

  // 文本内容
  if (choice.message?.content) {
    content.push({ type: "text", text: choice.message.content });
  }

  // 工具调用
  if (choice.message?.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(tc.function.arguments) as Record<string, unknown>;
      } catch {
        input = { raw: tc.function.arguments };
      }
      content.push({
        type: "tool_use",
        id: tc.id,
        name: tc.function.name,
        input,
      });
    }
  }

  // 确保至少有一个 content 块
  if (content.length === 0) {
    content.push({ type: "text", text: "" });
  }

  // 转换 finish_reason
  let stopReason: string;
  switch (choice.finish_reason) {
    case "stop":
      stopReason = "end_turn";
      break;
    case "tool_calls":
      stopReason = "tool_use";
      break;
    case "length":
      stopReason = "max_tokens";
      break;
    default:
      stopReason = choice.finish_reason ?? "end_turn";
  }

  return { stop_reason: stopReason, content };
}

// ─── 工具格式转换 ──────────────────────────────────────────────────────────────

/**
 * 将 XiangDi 的工具定义（Anthropic 格式）转换为 OpenAI function calling 格式
 */
function convertToOpenAITools(tools: unknown[]): unknown[] {
  return tools.map((tool) => {
    const t = tool as {
      name?: string;
      description?: string;
      input_schema?: unknown;
    };
    return {
      type: "function",
      function: {
        name: t.name ?? "unknown",
        description: t.description ?? "",
        parameters: t.input_schema ?? { type: "object", properties: {} },
      },
    };
  });
}
