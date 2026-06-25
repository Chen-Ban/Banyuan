/**
 * SQLite 实现的 CheckpointStore
 *
 * 适用于单机部署和开发环境。使用 LangGraph 的 SqliteSaver 持久化执行状态，
 * 并通过 TTL 清理策略防止 db 文件无限膨胀。
 *
 * 环境变量：
 * - CHECKPOINT_DB_PATH: SQLite 文件路径，默认 ./data/checkpoints.db
 */

import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite'
import type { BaseCheckpointSaver } from '@langchain/langgraph'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { CheckpointStore, ThreadStatus, CleanupConfig } from './types.js'
import { DEFAULT_CLEANUP_CONFIG } from './types.js'

// ─── 内部类型 ────────────────────────────────────────────────────────────────────

/** SqliteSaver 内部的 better-sqlite3 Database 接口（仅声明本模块用到的方法） */
interface SqliteDB {
  exec(sql: string): void
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number }
    all(...params: unknown[]): unknown[]
    get(...params: unknown[]): unknown
  }
  transaction<T extends (...args: unknown[]) => unknown>(fn: T): T
}

// ─── 实现 ────────────────────────────────────────────────────────────────────────

export class SqliteCheckpointStore implements CheckpointStore {
  readonly backend = 'sqlite'

  private readonly dbPath: string
  private readonly cleanupConfig: CleanupConfig
  private saver: SqliteSaver | null = null
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  constructor(options?: { dbPath?: string; cleanup?: Partial<CleanupConfig> }) {
    this.dbPath = options?.dbPath ?? process.env.CHECKPOINT_DB_PATH ?? './data/checkpoints.db'
    this.cleanupConfig = { ...DEFAULT_CLEANUP_CONFIG, ...options?.cleanup }
  }

  // ─── CheckpointStore interface ─────────────────────────────────────────────

  getCheckpointer(): BaseCheckpointSaver {
    if (!this.saver) {
      this.ensureDataDir()
      this.saver = SqliteSaver.fromConnString(this.dbPath)
    }
    return this.saver
  }

  recordActivity(threadId: string, status: ThreadStatus): void {
    try {
      const db = this.getDB()
      db.prepare(
        `INSERT INTO thread_activity (thread_id, status, last_active_at)
         VALUES (?, ?, ?)
         ON CONFLICT(thread_id) DO UPDATE SET status = excluded.status, last_active_at = excluded.last_active_at`,
      ).run(threadId, status, Date.now())
    } catch (err) {
      // 不应阻塞主流程
      console.warn('[SqliteCheckpointStore] Failed to record activity:', err)
    }
  }

  start(): void {
    // 确保 saver 已初始化（触发 db 文件创建）
    this.getCheckpointer()
    this.ensureActivityTable()

    // 启动 TTL 清理定时任务
    const { interval } = this.cleanupConfig
    if (this.cleanupTimer) clearInterval(this.cleanupTimer)

    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredThreads().catch((err) => {
        console.error('[SqliteCheckpointStore] Cleanup error:', err)
      })
    }, interval)
    this.cleanupTimer.unref()

    console.log(
      `[SqliteCheckpointStore] Started (path=${this.dbPath}, ` +
        `completedTTL=${this.cleanupConfig.completedTTL}ms, ` +
        `interruptedTTL=${this.cleanupConfig.interruptedTTL}ms, ` +
        `interval=${interval}ms)`,
    )
  }

  async stop(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
    this.saver = null
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private ensureDataDir(): void {
    const dir = dirname(this.dbPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
  }

  private getDB(): SqliteDB {
    const saver = this.getCheckpointer() as unknown as { isSetup: boolean; setup(): void; db: SqliteDB }
    if (!saver.isSetup) {
      saver.setup()
    }
    return saver.db
  }

  private ensureActivityTable(): void {
    const db = this.getDB()
    db.exec(`
CREATE TABLE IF NOT EXISTS thread_activity (
  thread_id TEXT NOT NULL PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'running',
  last_active_at INTEGER NOT NULL
);`)
  }

  private async cleanupExpiredThreads(): Promise<void> {
    const db = this.getDB()
    const now = Date.now()
    const { completedTTL, interruptedTTL } = this.cleanupConfig

    // 查询过期的 completed threads
    const completedCutoff = now - completedTTL
    const expiredCompleted = db
      .prepare(`SELECT thread_id FROM thread_activity WHERE status = 'completed' AND last_active_at < ?`)
      .all(completedCutoff) as Array<{ thread_id: string }>

    // 查询过期的 running/interrupted threads
    const interruptedCutoff = now - interruptedTTL
    const expiredOther = db
      .prepare(`SELECT thread_id FROM thread_activity WHERE status != 'completed' AND last_active_at < ?`)
      .all(interruptedCutoff) as Array<{ thread_id: string }>

    const expiredThreadIds = [
      ...expiredCompleted.map((r) => r.thread_id),
      ...expiredOther.map((r) => r.thread_id),
    ]

    if (expiredThreadIds.length === 0) return

    // 批量删除（事务保证一致性）
    const deleteCheckpoints = db.prepare(`DELETE FROM checkpoints WHERE thread_id = ?`)
    const deleteWrites = db.prepare(`DELETE FROM writes WHERE thread_id = ?`)
    const deleteActivity = db.prepare(`DELETE FROM thread_activity WHERE thread_id = ?`)

    const deleteBatch = (threadIds: string[]) => {
      for (const threadId of threadIds) {
        deleteCheckpoints.run(threadId)
        deleteWrites.run(threadId)
        deleteActivity.run(threadId)
      }
    }
    const transaction = db.transaction(deleteBatch as (...args: unknown[]) => unknown)
    transaction(expiredThreadIds)

    console.log(
      `[SqliteCheckpointStore] Cleaned ${expiredThreadIds.length} expired threads ` +
        `(${expiredCompleted.length} completed, ${expiredOther.length} interrupted/running)`,
    )
  }
}
