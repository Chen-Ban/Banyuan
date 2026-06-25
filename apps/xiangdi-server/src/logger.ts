/**
 * 结构化日志模块
 *
 * 输出 JSON Lines 格式，字段：
 *   - timestamp: ISO 8601 时间戳
 *   - level: debug | info | warn | error
 *   - message: 日志消息
 *   - trace_id: 链路追踪 ID（可选，关联 LangSmith trace）
 *   - span_id: 当前 span ID（可选）
 *   - service_name: 服务名称（默认 "xiangdi-server"）
 *   - requestId: 请求 ID（可选）
 *   - error: 错误信息（可选）
 *   - meta: 附加元数据（可选）
 *
 * 日志级别通过环境变量 LOG_LEVEL 控制，默认 'info'
 */

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  service_name: string
  trace_id?: string
  span_id?: string
  requestId?: string
  error?: { message: string; stack?: string; name?: string }
  meta?: Record<string, unknown>
}

export interface LoggerOpts {
  requestId?: string
  traceId?: string
  spanId?: string
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, err?: Error | unknown, meta?: Record<string, unknown>): void
}

// ─── 级别优先级 ──────────────────────────────────────────────────────────────

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

function getConfiguredLevel(): LogLevel {
  const envLevel = (process.env.LOG_LEVEL ?? 'info').toLowerCase()
  if (envLevel in LEVEL_PRIORITY) return envLevel as LogLevel
  return 'info'
}

const configuredLevel = getConfiguredLevel()
const SERVICE_NAME = process.env.SERVICE_NAME ?? 'xiangdi-server'

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[configuredLevel]
}

// ─── 输出 ────────────────────────────────────────────────────────────────────

function writeLog(entry: LogEntry): void {
  const line = JSON.stringify(entry)
  if (entry.level === 'error') {
    process.stderr.write(line + '\n')
  } else {
    process.stdout.write(line + '\n')
  }
}

// ─── 序列化错误 ──────────────────────────────────────────────────────────────

function serializeError(err: Error | unknown): LogEntry['error'] {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
    }
  }
  return { message: String(err) }
}

// ─── Logger 工厂 ─────────────────────────────────────────────────────────────

function createLoggerInternal(opts?: LoggerOpts): Logger {
  const { requestId, traceId, spanId } = opts ?? {}

  const log = (level: LogLevel, message: string, err?: Error | unknown, meta?: Record<string, unknown>) => {
    if (!shouldLog(level)) return
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service_name: SERVICE_NAME,
    }
    if (requestId) entry.requestId = requestId
    if (traceId) entry.trace_id = traceId
    if (spanId) entry.span_id = spanId
    if (err !== undefined) entry.error = serializeError(err)
    if (meta && Object.keys(meta).length > 0) entry.meta = meta
    writeLog(entry)
  }

  return {
    debug(message: string, meta?: Record<string, unknown>) {
      log('debug', message, undefined, meta)
    },
    info(message: string, meta?: Record<string, unknown>) {
      log('info', message, undefined, meta)
    },
    warn(message: string, meta?: Record<string, unknown>) {
      log('warn', message, undefined, meta)
    },
    error(message: string, err?: Error | unknown, meta?: Record<string, unknown>) {
      log('error', message, err, meta)
    },
  }
}

/**
 * 全局 logger（无额外上下文绑定）
 */
export const logger: Logger = createLoggerInternal()

/**
 * 创建带上下文绑定的子 logger
 *
 * @param opts 可选上下文：requestId / traceId / spanId
 */
export function createRequestLogger(opts?: string | LoggerOpts): Logger {
  if (typeof opts === 'string') {
    // 兼容旧用法：createRequestLogger('req-123')
    return createLoggerInternal({ requestId: opts })
  }
  return createLoggerInternal(opts)
}
