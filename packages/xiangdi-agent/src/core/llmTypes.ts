/**
 * 相地 · LLM 类型定义
 *
 * LLM 调用层的核心类型接口，被整个 XiangDi 项目广泛使用。
 */

// ─── 最小化 Anthropic SDK 类型（避免强依赖，运行时由调用方注入）─────────────

/** 流式调用时每个 token 到达时的回调 */
export type OnTokenCallback = (token: string) => void

export interface LLMClient {
  createMessage(params: {
    model: string
    max_tokens: number
    system?: string
    messages: import('./types.js').Message[]
    tools?: unknown[]
    temperature?: number
    /** LangSmith trace run 名称（用于区分同一 node 中的多次 LLM 调用） */
    runName?: string
  }): Promise<LLMResponse>

  /**
   * 流式 LLM 调用。
   *
   * 与 createMessage 参数完全相同，额外接收 onToken 回调——
   * 每当 LLM 输出一个新 token 时立即调用，实现逐字输出。
   *
   * 返回完整的 LLMResponse（与 createMessage 相同，方便工具调用解析）。
   * 如果实现方不支持流式，可降级为调用 createMessage 并在完成后批量回调。
   */
  createMessageStream(
    params: {
      model: string
      max_tokens: number
      system?: string
      messages: import('./types.js').Message[]
      tools?: unknown[]
      temperature?: number
      /** LangSmith trace run 名称 */
      runName?: string
    },
    onToken: OnTokenCallback,
  ): Promise<LLMResponse>
}

export interface LLMResponse {
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | string
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  >
  /** LLM API 返回的精确 token 用量（DeepSeek / OpenAI 兼容协议） */
  usage?: {
    inputTokens: number
    outputTokens: number
    model: string
    /** 缓存命中 token 数（DeepSeek 特有，可为 0） */
    cachedInputTokens?: number
  }
}
