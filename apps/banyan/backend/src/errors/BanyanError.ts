/**
 * Banyan 后端统一错误基类
 *
 * 所有业务错误都继承此类，提供：
 * - code: 机器可读的错误码（前端按此分类处理）
 * - category: 错误分类（前端按此决定 UI 展示策略）
 * - httpStatus: 当错误发生在 HTTP 阶段时的状态码
 * - retryable: 是否建议重试
 * - userMessage: 面向用户的友好提示（中文）
 * - details: 可选的结构化附加信息
 */

/**
 * 错误分类枚举
 *
 * 前端根据 category 决定 UI 策略：
 * - validation: 参数/输入校验错误 → 提示修正
 * - auth: 认证/授权错误 → 引导重新登录或提示无权限
 * - upstream: 上游服务错误（XiangDi/LLM/知识服务）→ 提示稍后重试
 * - resource: 资源不存在/状态不对 → 提示刷新或检查
 * - budget: 资源预算超限（context window/配额）→ 引导清理
 * - concurrency: 并发冲突 → 自动排队或提示等待
 * - internal: 内部错误（兜底）→ 展示通用错误
 */
export type ErrorCategory =
  | 'validation'
  | 'auth'
  | 'upstream'
  | 'resource'
  | 'budget'
  | 'concurrency'
  | 'internal'

/** 前端接收的统一错误载荷格式（HTTP body 和 SSE data 共用） */
export interface ErrorPayload {
  code: string
  category: ErrorCategory
  message: string
  retryable: boolean
  details?: Record<string, unknown>
}

export interface BanyanErrorOptions {
  code: string
  category: ErrorCategory
  /** 开发者日志消息（技术描述，写入日志） */
  message: string
  /** 用户可见消息（中文，返回给前端展示） */
  userMessage: string
  httpStatus?: number
  retryable?: boolean
  details?: Record<string, unknown>
  cause?: Error
}

export class BanyanError extends Error {
  readonly code: string
  readonly category: ErrorCategory
  readonly httpStatus: number
  readonly retryable: boolean
  readonly userMessage: string
  readonly details?: Record<string, unknown>
  cause?: unknown

  constructor(opts: BanyanErrorOptions) {
    super(opts.message)
    this.name = 'BanyanError'
    this.code = opts.code
    this.category = opts.category
    this.httpStatus = opts.httpStatus ?? 500
    this.retryable = opts.retryable ?? false
    this.userMessage = opts.userMessage
    this.details = opts.details
    if (opts.cause) {
      this.cause = opts.cause
    }
  }

  /** 序列化为前端可用的 JSON（SSE data 或 HTTP body 统一格式） */
  toJSON(): ErrorPayload {
    return {
      code: this.code,
      category: this.category,
      message: this.userMessage,
      retryable: this.retryable,
      ...(this.details ? { details: this.details } : {}),
    }
  }
}
