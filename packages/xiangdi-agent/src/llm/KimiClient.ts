/**
 * 相地 · Kimi LLM 客户端
 *
 * Kimi（Moonshot AI）完全兼容 OpenAI 协议，baseURL 为 https://api.moonshot.ai/v1。
 * 实现与 DeepSeekClient 完全相同的 LLMClient 接口，内部同样基于 openai SDK。
 *
 * 支持的模型：
 *   - kimi-k2.6        — 256k 上下文，Kimi 迨今最智能模型，强 Agent/代码能力（推荐）
 *   - kimi-k2.5        — 256k 上下文，多模态 + Agent + 代码
 *   - moonshot-v1-128k — 128k 上下文，旧版模型（仅向后兼容）
 *
 * 使用示例：
 * ```ts
 * import { KimiClient } from "@banyuan/xiangdi-agent";
 *
 * const client = new KimiClient({
 *   apiKey: "sk-xxx",
 *   model: "kimi-k2.6",
 * });
 *
 * // 作为 LLMClient 传入 MasterGraph
 * const response = await client.createMessage(messages, tools);
 * ```
 */

import OpenAI from 'openai'
import type { LLMClient, LLMResponse, OnTokenCallback } from '../core/llmTypes.js'
import type { Message } from '../core/types.js'

// ─── 配置 ──────────────────────────────────────────────────────────────────────

export interface KimiConfig {
  /** API Key（从 https://platform.moonshot.cn 获取） */
  apiKey: string
  /** 模型名称，默认 "kimi-k2.6" */
  model?: string
  /** API 基础 URL，默认 "https://api.moonshot.ai/v1" */
  baseUrl?: string
  /** 请求超时（毫秒），默认 120000 */
  timeout?: number
}

// ─── KimiClient ────────────────────────────────────────────────────────────────

/**
 * Kimi LLM 客户端
 *
 * 实现 XiangDi 的 LLMClient 接口（createMessage），
 * 内部通过 openai SDK 调用 Kimi OpenAI-compatible API。
 */
export class KimiClient implements LLMClient {
  private readonly openai: OpenAI
  private readonly defaultModel: string

  constructor(config: KimiConfig) {
    this.defaultModel = config.model ?? 'kimi-k2.6'
    this.openai = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl ?? 'https://api.moonshot.ai/v1',
      timeout: config.timeout ?? 120_000,
    })
  }

  async createMessage(params: {
    model: string
    max_tokens: number
    system?: string
    messages: Message[]
    tools?: unknown[]
    temperature?: number
    runName?: string
  }): Promise<LLMResponse> {
    const openAIMessages = buildOpenAIMessages(params.system, params.messages)

    const requestParams: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
      model: params.model || this.defaultModel,
      messages: openAIMessages,
      max_tokens: params.max_tokens,
      temperature: params.temperature ?? 0.7,
    }

    // 工具调用支持
    if (params.tools && params.tools.length > 0) {
      requestParams.tools = convertToOpenAITools(params.tools)
      requestParams.tool_choice = 'auto'
    }

    const completion = await this.openai.chat.completions.create(requestParams)
    return convertToLLMResponse(completion)
  }

  async createMessageStream(
    params: {
      model: string
      max_tokens: number
      system?: string
      messages: Message[]
      tools?: unknown[]
      temperature?: number
      runName?: string
    },
    onToken: OnTokenCallback,
  ): Promise<LLMResponse> {
    const openAIMessages = buildOpenAIMessages(params.system, params.messages)

    // 有工具调用时降级为非流式（工具参数需要完整 JSON，逐字流式无法可靠解析）
    const hasTools = params.tools && params.tools.length > 0
    if (hasTools) {
      const requestParams: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
        model: params.model || this.defaultModel,
        messages: openAIMessages,
        max_tokens: params.max_tokens,
        temperature: params.temperature ?? 0.7,
        tools: convertToOpenAITools(params.tools!),
        tool_choice: 'auto',
      }
      const completion = await this.openai.chat.completions.create(requestParams)
      const textContent = completion.choices[0]?.message?.content ?? ''
      if (textContent) onToken(textContent)
      return convertToLLMResponse(completion)
    }

    // 纯文本：流式调用，逐 token 回调
    const stream = await this.openai.chat.completions.create({
      model: params.model || this.defaultModel,
      messages: openAIMessages,
      max_tokens: params.max_tokens,
      temperature: params.temperature ?? 0.7,
      stream: true,
      stream_options: { include_usage: true },
    })

    let fullText = ''
    let finishReason: string | null = null
    let usage: LLMResponse['usage'] = undefined

    for await (const chunk of stream) {
      // 最后一个 chunk（usage 信息）：choices 可能为空，usage 携带总用量
      if (chunk.usage) {
        usage = {
          inputTokens: chunk.usage.prompt_tokens,
          outputTokens: chunk.usage.completion_tokens,
          model: (chunk.model ?? params.model) || this.defaultModel,
          cachedInputTokens: (chunk.usage as { prompt_tokens_details?: { cached_tokens?: number } }).prompt_tokens_details?.cached_tokens,
        }
      }
      const delta = chunk.choices[0]?.delta?.content
      if (delta) {
        fullText += delta
        onToken(delta)
      }
      const reason = chunk.choices[0]?.finish_reason
      if (reason) finishReason = reason
    }

    let stopReason: string
    switch (finishReason) {
      case 'stop':
        stopReason = 'end_turn'
        break
      case 'tool_calls':
        stopReason = 'tool_use'
        break
      case 'length':
        stopReason = 'max_tokens'
        break
      default:
        stopReason = finishReason ?? 'end_turn'
    }

    return {
      stop_reason: stopReason,
      content: fullText ? [{ type: 'text', text: fullText }] : [{ type: 'text', text: '' }],
      usage,
    }
  }
}

// ─── 格式转换：XiangDi Message → OpenAI ChatCompletionMessageParam ─────────────

function buildOpenAIMessages(
  system: string | undefined,
  messages: Message[],
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const result: OpenAI.Chat.ChatCompletionMessageParam[] = []

  if (system) {
    result.push({ role: 'system', content: system })
  }

  for (const msg of messages) {
    if (msg.role === 'user') {
      // MasterGraph 以 Anthropic 风格将 ToolResultContent[] 作为 role:"user" 推入上下文。
      // OpenAI 协议要求这些作为独立的 role:"tool" 消息紧跟在含 tool_calls 的 assistant 消息之后。
      if (isToolResultArray(msg.content)) {
        const toolResults = msg.content as ToolResultContentLike[]
        for (const tr of toolResults) {
          const contentStr =
            typeof tr.content === 'string'
              ? tr.content
              : Array.isArray(tr.content)
                ? tr.content.map((c) => c.text).join('\n')
                : ''
          result.push({
            role: 'tool',
            content: contentStr,
            tool_call_id: tr.tool_use_id,
          })
        }
      } else {
        result.push({ role: 'user', content: extractTextContent(msg.content) })
      }
    } else if (msg.role === 'assistant') {
      result.push(convertAssistantMessage(msg.content))
    } else if (msg.role === 'tool') {
      result.push({
        role: 'tool',
        content: extractTextContent(msg.content),
        tool_call_id: extractToolCallId(msg.content),
      })
    }
  }

  return result
}

/** ToolResultContent 的轻量类型守卫（避免直接 import 循环） */
interface ToolResultContentLike {
  type: 'tool_result'
  tool_use_id: string
  content: string | { type: 'text'; text: string }[]
  is_error?: boolean
}

/**
 * 判断 message.content 是否为 ToolResultContent[]
 * MasterGraph 推入时的实际形态：数组且每个元素 type === "tool_result"
 */
function isToolResultArray(content: Message['content']): boolean {
  if (!Array.isArray(content)) return false
  if (content.length === 0) return false
  return content.every((item) => typeof item === 'object' && item !== null && item.type === 'tool_result')
}

function extractTextContent(content: Message['content']): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  return content
    .map((part) => {
      if (part.type === 'text') return part.text
      if (part.type === 'tool_result') return part.content ?? ''
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

function extractToolCallId(content: Message['content']): string {
  if (!Array.isArray(content)) return ''
  for (const part of content) {
    if (part.type === 'tool_result' && part.tool_use_id) {
      return part.tool_use_id
    }
  }
  return ''
}

function convertAssistantMessage(
  content: Message['content'],
): OpenAI.Chat.ChatCompletionAssistantMessageParam {
  if (typeof content === 'string') {
    return { role: 'assistant', content }
  }
  if (!Array.isArray(content)) {
    return { role: 'assistant', content: '' }
  }

  const textParts: string[] = []
  const toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[] = []

  for (const part of content) {
    if (part.type === 'text') {
      textParts.push(part.text)
    } else if (part.type === 'tool_use') {
      toolCalls.push({
        id: part.id,
        type: 'function',
        function: {
          name: part.name,
          arguments: JSON.stringify(part.input),
        },
      })
    }
  }

  const msg: OpenAI.Chat.ChatCompletionAssistantMessageParam = {
    role: 'assistant',
    content: textParts.length > 0 ? textParts.join('\n') : null,
  }

  if (toolCalls.length > 0) {
    msg.tool_calls = toolCalls
  }

  return msg
}

// ─── 格式转换：OpenAI ChatCompletion → LLMResponse ────────────────────────────

function convertToLLMResponse(completion: OpenAI.Chat.ChatCompletion): LLMResponse {
  const choice = completion.choices[0]
  if (!choice) {
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: '' }] }
  }

  const content: LLMResponse['content'] = []

  if (choice.message.content) {
    content.push({ type: 'text', text: choice.message.content })
  }

  if (choice.message.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      let input: Record<string, unknown> = {}
      try {
        input = JSON.parse(tc.function.arguments) as Record<string, unknown>
      } catch {
        input = { raw: tc.function.arguments }
      }
      content.push({
        type: 'tool_use',
        id: tc.id,
        name: tc.function.name,
        input,
      })
    }
  }

  if (content.length === 0) {
    content.push({ type: 'text', text: '' })
  }

  // 转换 finish_reason → XiangDi stop_reason
  let stopReason: string
  switch (choice.finish_reason) {
    case 'stop':
      stopReason = 'end_turn'
      break
    case 'tool_calls':
      stopReason = 'tool_use'
      break
    case 'length':
      stopReason = 'max_tokens'
      break
    default:
      stopReason = choice.finish_reason ?? 'end_turn'
  }

  // 提取精确 token 用量（Kimi 兼容 OpenAI 协议）
  const usage = completion.usage
    ? {
        inputTokens: completion.usage.prompt_tokens,
        outputTokens: completion.usage.completion_tokens,
        model: completion.model,
        cachedInputTokens: (completion.usage as { prompt_tokens_details?: { cached_tokens?: number } }).prompt_tokens_details?.cached_tokens,
      }
    : undefined

  return { stop_reason: stopReason, content, usage }
}

// ─── 工具格式转换 ──────────────────────────────────────────────────────────────

function convertToOpenAITools(tools: unknown[]): OpenAI.Chat.ChatCompletionTool[] {
  return tools.map((tool) => {
    const t = tool as {
      name?: string
      description?: string
      input_schema?: OpenAI.FunctionParameters
    }
    return {
      type: 'function' as const,
      function: {
        name: t.name ?? 'unknown',
        description: t.description ?? '',
        parameters: t.input_schema ?? { type: 'object', properties: {} },
      },
    }
  })
}
