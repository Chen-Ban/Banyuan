/**
 * 自定义错误类型
 *
 * ServiceUnavailableError — 当依赖的后端服务（banyan 后端、知识服务等）不可用时抛出
 */

export class ServiceUnavailableError extends Error {
  /** HTTP 状态码，固定 503 */
  readonly statusCode = 503

  /** 不可用的服务名称 */
  readonly service: string

  /** 原始错误（如有） */
  readonly cause?: Error

  constructor(service: string, message: string, cause?: Error) {
    super(`[${service}] ${message}`)
    this.name = 'ServiceUnavailableError'
    this.service = service
    this.cause = cause

    // 保持正确的原型链
    Object.setPrototypeOf(this, ServiceUnavailableError.prototype)
  }
}
