/**
 * Banyan 后端统一错误体系 — barrel 导出
 */

export { BanyanError } from './BanyanError.js'
export type { ErrorCategory, ErrorPayload, BanyanErrorOptions } from './BanyanError.js'

// AI 对话域
export {
  AiMissingParamError,
  AiAppNotFoundError,
  AiDialogueConflictError,
  AiNoConfirmableDialogueError,
  AiQuotaExceededError,
  AiContextBudgetError,
  AiUpstreamConnectError,
  AiUpstreamTimeoutError,
  AiUpstreamStatusError,
  AiUpstreamStreamError,
  AiAgentError,
  AiPersistenceError,
} from './ai.js'

// 通用域
export {
  AuthTokenExpiredError,
  AuthTokenInvalidError,
  AuthForbiddenError,
  ResourceNotFoundError,
  ValidationError,
  ConcurrencyError,
} from './common.js'
