/**
 * 结构化日志模块
 *
 * 输出 JSON Lines 格式，字段：
 *   - timestamp: ISO 8601 时间戳
 *   - level: debug | info | warn | error
 *   - message: 日志消息
 *   - requestId: 请求 ID（可选，由 createRequestLogger 绑定）
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
    requestId?: string
    error?: { message: string; stack?: string; name?: string }
    meta?: Record<string, unknown>
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

function createLoggerInternal(requestId?: string): Logger {
    const log = (level: LogLevel, message: string, err?: Error | unknown, meta?: Record<string, unknown>) => {
        if (!shouldLog(level)) return
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
        }
        if (requestId) entry.requestId = requestId
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
 * 全局 logger（无 requestId 绑定）
 */
export const logger: Logger = createLoggerInternal()

/**
 * 创建带 requestId 的子 logger
 */
export function createRequestLogger(requestId: string): Logger {
    return createLoggerInternal(requestId)
}
