/**
 * banyan-backend 结构化日志实例
 *
 * 所有模块统一从此文件 import logger、createLogger。
 * SERVICE_NAME 在 apps/banyan/backend/src/index.ts 入口设置。
 */

export { logger, createRequestLogger as createLogger } from '@banyuan/logger'

export type { Logger, LoggerOpts } from '@banyuan/logger'
