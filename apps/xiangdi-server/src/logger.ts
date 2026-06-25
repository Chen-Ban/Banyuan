/**
 * 结构化日志模块
 *
 * 本文件为 @banyuan/logger 的本地转发层，保持对原有 import 路径的兼容。
 * 所有日志功能统一由 @banyuan/logger 提供。
 *
 * 服务名称通过环境变量 SERVICE_NAME 控制，默认 'xiangdi-server'
 * 日志级别通过环境变量 LOG_LEVEL 控制，默认 'info'
 */

export { logger, createRequestLogger } from '@banyuan/logger'
export type { Logger, LoggerOpts } from '@banyuan/logger'
