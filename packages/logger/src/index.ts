/**
 * @banyuan/logger — 共享结构化日志库
 *
 * 基于 pino，统一 banyan-backend 和 xiangdi-server 的日志格式。
 * 输出 JSON Lines，字段对齐 xiangdi-server 原有 LogEntry 规范：
 *   timestamp / level / message / service_name / trace_id / span_id
 *   requestId / error / meta
 *
 * 日志级别通过环境变量 LOG_LEVEL 控制，默认 'info'
 * 服务名称通过环境变量 SERVICE_NAME 控制，默认 'banyan'
 */

import pino from 'pino'

// ─── 类型导出（与 xiangdi-server 原有 Logger 接口兼容）──────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LoggerOpts {
  requestId?: string
  traceId?: string
  spanId?: string
}

export interface Logger {
  debug(message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
  child(opts: LoggerOpts): Logger
}

// ─── pino 实例工厂 ───────────────────────────────────────────────────────────

function getServiceName(): string {
  return process.env.SERVICE_NAME ?? 'banyan'
}

function getLogLevel(): pino.Level {
  return (process.env.LOG_LEVEL ?? 'info').toLowerCase() as pino.Level
}

/**
 * 自定义错误序列化器 — 对齐 xiangdi-server 原有 LogEntry.error 格式
 */
function serializeError(err: Error): { message: string; stack?: string; name?: string } {
  return {
    name: err.name,
    message: err.message,
    stack: err.stack,
  }
}

/**
 * 获取 pino mixin（注入固定字段 + 绑定上下文）
 */
function mixinFactory(context?: LoggerOpts): () => Record<string, unknown> {
  return () => {
    const mixin: Record<string, unknown> = {
      service_name: getServiceName(),
    }
    if (context?.requestId) mixin.requestId = context.requestId
    if (context?.traceId) mixin.trace_id = context.traceId
    if (context?.spanId) mixin.span_id = context.spanId
    return mixin
  }
}

/**
 * 判断当前环境是否应该美化输出
 * 开发环境（非生产）且 LOG_PRETTY 不为 '0'/'false' 时启用
 */
function shouldUsePretty(): boolean {
  if (process.env.NODE_ENV === 'production') return false
  const logPretty = process.env.LOG_PRETTY
  if (logPretty === '0' || logPretty === 'false' || logPretty === 'no') return false
  return true
}

function createPinoInstance(context?: LoggerOpts): pino.Logger {
  const transport = shouldUsePretty()
    ? pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'service_name,hostname,pid',
        },
      })
    : undefined

  return pino(
    {
      level: getLogLevel(),
      serializers: {
        err: serializeError,
        error: serializeError,
      },
      mixin: mixinFactory(context),
      // pino 默认自带 timestamp/level/message/pid/hostname，
      // 用 customLevels 和 formatters 对齐 xiangdi-server 格式
      formatters: {
        level(label: string) {
          return { level: label }
        },
        bindings(bindings: Record<string, unknown>) {
          // 移除 pino 默认的 pid/hostname，由 mixin 注入 service_name
          const { pid, hostname, ...rest } = bindings
          return { service_name: getServiceName(), ...rest }
        },
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    transport ?? undefined,
  )
}

// ─── 全局实例 ─────────────────────────────────────────────────────────────────

const pinoLogger = createPinoInstance()

/**
 * 全局 logger（无额外上下文绑定）
 */
export const logger: Logger = toLoggerInterface(pinoLogger)

/**
 * 创建带上下文绑定的子 logger
 *
 * @param opts 可选上下文：requestId / traceId / spanId
 */
export function createRequestLogger(opts?: string | LoggerOpts): Logger {
  if (typeof opts === 'string') {
    return toLoggerInterface(pinoLogger.child({ requestId: opts }))
  }
  return toLoggerInterface(pinoLogger.child({
    requestId: opts?.requestId,
    trace_id: opts?.traceId,
    span_id: opts?.spanId,
  }))
}

/**
 * 将 pino.Logger 适配为 Logger 接口
 */
function toLoggerInterface(pino: pino.Logger): Logger {
  return {
    debug(message: string, ...args: unknown[]) {
      if (args.length > 0) (pino.debug as unknown as (...a: unknown[]) => void)(message, ...args)
      else pino.debug(message)
    },
    info(message: string, ...args: unknown[]) {
      if (args.length > 0) (pino.info as unknown as (...a: unknown[]) => void)(message, ...args)
      else pino.info(message)
    },
    warn(message: string, ...args: unknown[]) {
      if (args.length > 0) (pino.warn as unknown as (...a: unknown[]) => void)(message, ...args)
      else pino.warn(message)
    },
    error(message: string, ...args: unknown[]) {
      if (args.length > 0) (pino.error as unknown as (...a: unknown[]) => void)(message, ...args)
      else pino.error(message)
    },
    child(opts: LoggerOpts): Logger {
      return toLoggerInterface(pino.child({
        requestId: opts?.requestId,
        trace_id: opts?.traceId,
        span_id: opts?.spanId,
      }))
    },
  }
}
