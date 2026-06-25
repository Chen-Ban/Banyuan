/**
 * 相地 · 工具注册表
 *
 * 如园中工匠各司其职，工具注册表统筹所有可用工具，
 * 按名索引，供 MasterGraph 在 tools 节点中调度。
 *
 * 内置瞬时错误自动重试机制（指数退避），对网络超时、
 * 限流、服务暂时不可用等瞬时故障自动恢复，无需消耗
 * LLM 推理轮次。
 */

import type { ToolDefinition, ToolHandler, RegisteredTool } from './types.js'

// ─── 重试配置 ────────────────────────────────────────────────────────────────

export interface RetryConfig {
  /** 最大重试次数（默认 3） */
  maxRetries: number
  /** 初始退避时间 ms（默认 500） */
  initialDelayMs: number
  /** 退避倍率（默认 2） */
  backoffMultiplier: number
  /** 最大退避时间 ms（默认 5000） */
  maxDelayMs: number
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 500,
  backoffMultiplier: 2,
  maxDelayMs: 5000,
}

/**
 * 判断是否为瞬时可重试错误
 * - 网络超时 / 连接中断
 * - HTTP 429（限流）
 * - HTTP 5xx（服务端暂时故障）
 * - ECONNRESET / ECONNREFUSED / ETIMEDOUT
 */
function isTransientError(err: unknown): boolean {
  if (!(err instanceof Error)) return false

  const msg = err.message.toLowerCase()
  const name = err.name.toLowerCase()

  // 网络连接错误
  const networkPatterns = [
    'econnreset',
    'econnrefused',
    'etimedout',
    'enotfound',
    'epipe',
    'ehostunreach',
    'enetunreach',
    'socket hang up',
    'network',
    'timeout',
    'aborted',
    'connect',
  ]
  if (networkPatterns.some((p) => msg.includes(p) || name.includes(p))) {
    return true
  }

  // HTTP 状态码类错误
  const statusMatch = msg.match(/\b(4[0-9]{2}|5[0-9]{2})\b/)
  if (statusMatch) {
    const status = parseInt(statusMatch[1]!, 10)
    // 429 限流 or 5xx 服务端错误
    if (status === 429 || (status >= 500 && status < 600)) {
      return true
    }
  }

  // 含 'rate limit' 关键字
  if (msg.includes('rate limit') || msg.includes('ratelimit') || msg.includes('too many requests')) {
    return true
  }

  // 含 'service unavailable' / 'temporarily unavailable'
  if (msg.includes('service unavailable') || msg.includes('temporarily unavailable')) {
    return true
  }

  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>()
  private retryConfig: RetryConfig

  constructor(retryConfig?: Partial<RetryConfig>) {
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig }
  }

  /**
   * 注册一个工具
   */
  register<TInput extends Record<string, unknown>, TOutput>(
    definition: ToolDefinition,
    handler: ToolHandler<TInput, TOutput>,
  ): this {
    if (this.tools.has(definition.name)) {
      console.warn(`[XiangDi] Tool "${definition.name}" is already registered. Overwriting.`)
    }
    this.tools.set(definition.name, {
      definition,
      handler: handler as ToolHandler,
    })
    return this
  }

  /**
   * 注销一个工具
   */
  unregister(name: string): this {
    this.tools.delete(name)
    return this
  }

  /**
   * 获取工具处理器
   */
  getHandler(name: string): ToolHandler | undefined {
    return this.tools.get(name)?.handler
  }

  /**
   * 获取所有工具的 LLM 定义（用于传给模型）
   */
  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition)
  }

  /**
   * 执行一个工具调用（含瞬时错误自动重试）
   *
   * 对网络超时、限流、服务暂时不可用等瞬时故障自动重试（指数退避），
   * 不消耗 LLM 推理轮次。逻辑错误（参数不合法、资源不存在等）不重试，
   * 直接返回错误信息让 LLM 自行修正。
   */
  async execute(
    name: string,
    input: Record<string, unknown>,
  ): Promise<{ result: unknown; is_error: boolean }> {
    const tool = this.tools.get(name)
    if (!tool) {
      return {
        result: `Tool "${name}" not found in registry.`,
        is_error: true,
      }
    }

    const { maxRetries, initialDelayMs, backoffMultiplier, maxDelayMs } = this.retryConfig
    let lastError: unknown = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await tool.handler(input)
        return { result, is_error: false }
      } catch (err) {
        lastError = err

        // 非瞬时错误：立即返回，不重试
        if (!isTransientError(err)) {
          const message = err instanceof Error ? err.message : String(err)
          return { result: message, is_error: true }
        }

        // 已用尽重试次数
        if (attempt >= maxRetries) {
          break
        }

        // 指数退避
        const delay = Math.min(initialDelayMs * Math.pow(backoffMultiplier, attempt), maxDelayMs)
        console.warn(
          `[XiangDi] Tool "${name}" transient error (attempt ${attempt + 1}/${maxRetries + 1}), ` +
            `retrying in ${delay}ms: ${err instanceof Error ? err.message : String(err)}`,
        )
        await sleep(delay)
      }
    }

    // 所有重试均失败
    const message = lastError instanceof Error ? lastError.message : String(lastError)
    return {
      result: `Tool "${name}" failed after ${maxRetries + 1} attempts (transient error): ${message}`,
      is_error: true,
    }
  }

  /**
   * 是否有已注册的工具
   */
  get isEmpty(): boolean {
    return this.tools.size === 0
  }

  get size(): number {
    return this.tools.size
  }
}
