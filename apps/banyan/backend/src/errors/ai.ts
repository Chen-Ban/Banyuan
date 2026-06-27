/**
 * AI 对话域错误定义
 *
 * 错误码命名规范：AI_{SUBCATEGORY}_{SPECIFIC}
 * 覆盖 AI 对话链路上所有可能出错的环节
 */

import { BanyanError } from './BanyanError.js'

// ─── 参数校验 ─────────────────────────────────────────────────────────────────

export class AiMissingParamError extends BanyanError {
  constructor(param: string) {
    super({
      code: 'AI_MISSING_PARAM',
      category: 'validation',
      message: `Missing required parameter: ${param}`,
      userMessage: `缺少必要参数：${param}`,
      httpStatus: 400,
    })
  }
}

// ─── 资源错误 ─────────────────────────────────────────────────────────────────

export class AiAppNotFoundError extends BanyanError {
  constructor(appId: string) {
    super({
      code: 'AI_APP_NOT_FOUND',
      category: 'resource',
      message: `Application ${appId} not found`,
      userMessage: '应用不存在或已被删除，请刷新页面',
      httpStatus: 404,
    })
  }
}

export class AiDialogueConflictError extends BanyanError {
  constructor(appId: string) {
    super({
      code: 'AI_DIALOGUE_CONFLICT',
      category: 'concurrency',
      message: `A dialogue is already in progress for app ${appId}`,
      userMessage: '当前应用有正在进行的对话，请等待完成后再试',
      httpStatus: 409,
      retryable: true,
    })
  }
}

export class AiNoConfirmableDialogueError extends BanyanError {
  constructor(appId?: string) {
    super({
      code: 'AI_NO_CONFIRMABLE',
      category: 'resource',
      message: `No confirmable dialogue found${appId ? ` for app ${appId}` : ''}`,
      userMessage: '没有待确认的对话，可能已超时或被撤销',
      httpStatus: 404,
    })
  }
}

// ─── 配额超限 ─────────────────────────────────────────────────────────────────

export class AiQuotaExceededError extends BanyanError {
  constructor(scope: 'team' | 'app', used: number, limit: number) {
    const scopeLabel = scope === 'app' ? '应用' : '团队'
    super({
      code: 'AI_QUOTA_EXCEEDED',
      category: 'budget',
      message: `AI quota exceeded (${scope}): ${used}/${limit}`,
      userMessage: `${scopeLabel} AI 额度已用尽（${used}/${limit}），请升级套餐或等待下月重置`,
      httpStatus: 402,
      retryable: false,
      details: { scope, used, limit },
    })
  }
}

// ─── 预算超限 ─────────────────────────────────────────────────────────────────

export class AiContextBudgetError extends BanyanError {
  constructor(details: {
    rigidTokens: number
    availableBudget: number
    recommendedBudget: number
    modelContextWindow: number
    recentRounds: number
  }) {
    super({
      code: 'AI_CONTEXT_BUDGET_OVERFLOW',
      category: 'budget',
      message: `Context budget overflow: ${details.rigidTokens} tokens > ${details.availableBudget} available`,
      userMessage: '对话历史过长，超出模型上下文窗口限制。建议清理历史对话或切换到更大窗口的模型。',
      httpStatus: 422,
      retryable: false,
      details: details as unknown as Record<string, unknown>,
    })
  }
}

// ─── 上游服务错误 ──────────────────────────────────────────────────────────────

/** 从底层 Error 中提取可读信息，兼容 message 为空串或 cause 为 undefined */
function causeInfo(cause?: Error): string {
  if (!cause) return 'unknown'
  return cause.message || (cause as NodeJS.ErrnoException).code || cause.name || 'unknown'
}

export class AiUpstreamConnectError extends BanyanError {
  constructor(service: string, url: string, cause?: Error) {
    super({
      code: 'AI_UPSTREAM_CONNECT',
      category: 'upstream',
      message: `Cannot connect to ${service} at ${url}: ${causeInfo(cause)}`,
      userMessage: 'AI 服务暂时不可用，请稍后重试',
      httpStatus: 502,
      retryable: true,
      details: { service, url, cause: causeInfo(cause) },
      cause,
    })
  }
}

export class AiUpstreamTimeoutError extends BanyanError {
  constructor(timeoutMs: number) {
    super({
      code: 'AI_UPSTREAM_TIMEOUT',
      category: 'upstream',
      message: `XiangDi request timed out after ${timeoutMs}ms`,
      userMessage: 'AI 响应超时，请稍后重试。如果问题持续，可以尝试简化提问。',
      httpStatus: 504,
      retryable: true,
      details: { timeoutMs },
    })
  }
}

export class AiUpstreamStatusError extends BanyanError {
  constructor(statusCode: number) {
    super({
      code: 'AI_UPSTREAM_STATUS',
      category: 'upstream',
      message: `XiangDi returned HTTP ${statusCode}`,
      userMessage: 'AI 服务返回异常，请稍后重试',
      httpStatus: 502,
      retryable: statusCode >= 500,
      details: { upstreamStatus: statusCode },
    })
  }
}

export class AiUpstreamStreamError extends BanyanError {
  constructor(cause?: Error) {
    super({
      code: 'AI_UPSTREAM_STREAM_BROKEN',
      category: 'upstream',
      message: `Upstream SSE stream broken: ${causeInfo(cause)}`,
      userMessage: 'AI 响应流中断，请重试',
      httpStatus: 502,
      retryable: true,
      details: { cause: causeInfo(cause) },
      cause,
    })
  }
}

/**
 * XiangDi 返回的 error 事件（LLM 限流/余额不足/工具执行失败等）
 *
 * 当 XiangDi 已经提供了用户可读的消息时，直接透传其 message；
 * 如果 XiangDi 同时携带了 code，则保留该 code（前缀为 AI_AGENT_）。
 */
export class AiAgentError extends BanyanError {
  /** 上游原始技术错误（仅用于日志，不展示给用户） */
  readonly upstreamMessage: string

  constructor(upstreamMessage: string, agentCode?: string) {
    super({
      code: agentCode ? `AI_AGENT_${agentCode}` : 'AI_AGENT_ERROR',
      category: 'upstream',
      message: `Agent error: ${upstreamMessage}`,
      userMessage: 'AI 处理过程中出现异常，请重试',
      httpStatus: 502,
      retryable: true,
    })
    this.upstreamMessage = upstreamMessage
  }
}

// ─── 落库/回调失败 ────────────────────────────────────────────────────────────

export class AiPersistenceError extends BanyanError {
  constructor(operation: string, cause?: Error) {
    super({
      code: 'AI_PERSISTENCE_FAILED',
      category: 'internal',
      message: `Failed to persist: ${operation} — ${cause?.message ?? 'unknown'}`,
      userMessage: '数据保存失败，请重试',
      httpStatus: 500,
      retryable: true,
      cause,
    })
  }
}
