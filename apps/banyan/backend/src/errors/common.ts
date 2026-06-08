/**
 * 通用域错误定义（非 AI 专属，整个后端共用）
 */

import { BanyanError } from './BanyanError.js'

// ─── 认证/授权 ────────────────────────────────────────────────────────────────

export class AuthTokenExpiredError extends BanyanError {
  constructor() {
    super({
      code: 'AUTH_TOKEN_EXPIRED',
      category: 'auth',
      message: 'Access token expired',
      userMessage: '登录已过期，请重新登录',
      httpStatus: 401,
    })
  }
}

export class AuthTokenInvalidError extends BanyanError {
  constructor(userMessage?: string) {
    super({
      code: 'AUTH_TOKEN_INVALID',
      category: 'auth',
      message: 'Access token invalid',
      userMessage: userMessage ?? '登录凭证无效，请重新登录',
      httpStatus: 401,
    })
  }
}

export class AuthForbiddenError extends BanyanError {
  constructor(userMessage?: string) {
    super({
      code: 'AUTH_FORBIDDEN',
      category: 'auth',
      message: `Forbidden`,
      userMessage: userMessage ?? '无权访问此资源',
      httpStatus: 403,
    })
  }
}

// ─── 资源 ─────────────────────────────────────────────────────────────────────

export class ResourceNotFoundError extends BanyanError {
  constructor(resource: string, id?: string) {
    super({
      code: 'RESOURCE_NOT_FOUND',
      category: 'resource',
      message: `${resource} not found${id ? `: ${id}` : ''}`,
      userMessage: `${resource}不存在`,
      httpStatus: 404,
    })
  }
}

// ─── 参数校验 ─────────────────────────────────────────────────────────────────

export class ValidationError extends BanyanError {
  constructor(userMessage: string, details?: Record<string, unknown>) {
    super({
      code: 'VALIDATION_ERROR',
      category: 'validation',
      message: userMessage,
      userMessage,
      httpStatus: 400,
      details,
    })
  }
}

// ─── 并发 ─────────────────────────────────────────────────────────────────────

export class ConcurrencyError extends BanyanError {
  constructor(resource: string) {
    super({
      code: 'CONCURRENCY_CONFLICT',
      category: 'concurrency',
      message: `Concurrency conflict on ${resource}`,
      userMessage: '操作冲突，请稍后重试',
      httpStatus: 409,
      retryable: true,
    })
  }
}
