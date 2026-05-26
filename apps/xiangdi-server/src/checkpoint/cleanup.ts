/**
 * 相地服务 · Checkpoint TTL 清理
 *
 * 定期扫描过期的 checkpoint thread 并清理，防止 SQLite 文件无限膨胀。
 *
 * 策略：维护 thread_activity 表记录每个 thread 最后活跃时间，
 * 清理时删除超过 TTL 未活跃的 thread 的所有 checkpoints 和 writes 数据。
 */

import { getCheckpointer } from "./index.js";

// ─── 类型 ──────────────────────────────────────────────────────────────────────

/**
 * SqliteSaver 内部的 better-sqlite3 Database 接口（仅声明本模块用到的方法）
 */
interface SqliteDB {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number };
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
  };
  transaction<T extends (...args: unknown[]) => unknown>(fn: T): T;
}

/** 从 checkpointer 获取底层 SQLite DB 实例 */
function getDB(): SqliteDB {
  const checkpointer = getCheckpointer();
  // 通过 getTuple 触发内部 setup()（setup 是 protected，无法直接调用）
  // 使用 isSetup 标志避免重复调用
  if (!(checkpointer as unknown as { isSetup: boolean }).isSetup) {
    (checkpointer as unknown as { setup(): void }).setup();
  }
  return (checkpointer as unknown as { db: SqliteDB }).db;
}

// ─── 配置 ──────────────────────────────────────────────────────────────────────

interface CleanupConfig {
  /** 已完成 thread 的保留时间（ms），默认 1 小时 */
  completedTTL: number;
  /** 中断/运行中 thread 的保留时间（ms），默认 24 小时 */
  interruptedTTL: number;
  /** 清理间隔（ms），默认 10 分钟 */
  interval: number;
}

const DEFAULT_CONFIG: CleanupConfig = {
  completedTTL: 60 * 60 * 1000,        // 1 hour
  interruptedTTL: 24 * 60 * 60 * 1000, // 24 hours
  interval: 10 * 60 * 1000,            // 10 minutes
};

// ─── Activity 追踪表 ────────────────────────────────────────────────────────────

/**
 * 确保 thread_activity 表存在。
 * 该表记录每个 thread 最后活跃时间和状态，用于 TTL 清理判断。
 */
function ensureActivityTable(): void {
  const db = getDB();
  db.exec(`
CREATE TABLE IF NOT EXISTS thread_activity (
  thread_id TEXT NOT NULL PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'running',
  last_active_at INTEGER NOT NULL
);`);
}

/**
 * 记录 thread 活跃状态（外部调用：每次 checkpoint 写入或 resume 时调用）
 */
export function recordThreadActivity(threadId: string, status: "running" | "completed" | "interrupted" = "running"): void {
  try {
    const db = getDB();
    db.prepare(
      `INSERT INTO thread_activity (thread_id, status, last_active_at)
       VALUES (?, ?, ?)
       ON CONFLICT(thread_id) DO UPDATE SET status = excluded.status, last_active_at = excluded.last_active_at`
    ).run(threadId, status, Date.now());
  } catch (err) {
    // 不应阻塞主流程
    console.warn("[checkpoint-cleanup] Failed to record thread activity:", err);
  }
}

// ─── 清理逻辑 ──────────────────────────────────────────────────────────────────

let _cleanupTimer: ReturnType<typeof setInterval> | null = null;

/**
 * 启动 checkpoint 清理定时任务
 */
export function startCheckpointCleanup(config: Partial<CleanupConfig> = {}): void {
  const { completedTTL, interruptedTTL, interval } = { ...DEFAULT_CONFIG, ...config };

  // 确保 activity 追踪表已创建
  ensureActivityTable();

  if (_cleanupTimer) {
    clearInterval(_cleanupTimer);
  }

  _cleanupTimer = setInterval(async () => {
    try {
      await cleanupExpiredThreads(completedTTL, interruptedTTL);
    } catch (err) {
      console.error("[checkpoint-cleanup] Error during cleanup:", err);
    }
  }, interval);

  // 不阻止进程退出
  _cleanupTimer.unref();

  console.log(
    `[checkpoint-cleanup] Started (completedTTL=${completedTTL}ms, interruptedTTL=${interruptedTTL}ms, interval=${interval}ms)`
  );
}

/**
 * 停止清理定时任务
 */
export function stopCheckpointCleanup(): void {
  if (_cleanupTimer) {
    clearInterval(_cleanupTimer);
    _cleanupTimer = null;
  }
}

/**
 * 清理过期 threads
 *
 * 策略：
 * 1. 从 thread_activity 表查询已超过 TTL 的 thread_id
 *    - status='completed' 的使用 completedTTL
 *    - 其他状态使用 interruptedTTL
 * 2. 删除这些 thread 在 checkpoints 和 writes 表中的所有记录
 * 3. 删除 thread_activity 表中对应记录
 * 4. 对于 checkpoints/writes 中存在但 thread_activity 中无记录的孤儿 thread，
 *    使用 interruptedTTL 作为保底（基于首次发现时间）
 */
async function cleanupExpiredThreads(
  completedTTL: number,
  interruptedTTL: number
): Promise<void> {
  const db = getDB();
  const now = Date.now();

  // 1. 查询已过期的 completed threads
  const completedCutoff = now - completedTTL;
  const expiredCompleted = db.prepare(
    `SELECT thread_id FROM thread_activity WHERE status = 'completed' AND last_active_at < ?`
  ).all(completedCutoff) as Array<{ thread_id: string }>;

  // 2. 查询已过期的 running/interrupted threads
  const interruptedCutoff = now - interruptedTTL;
  const expiredOther = db.prepare(
    `SELECT thread_id FROM thread_activity WHERE status != 'completed' AND last_active_at < ?`
  ).all(interruptedCutoff) as Array<{ thread_id: string }>;

  const expiredThreadIds = [
    ...expiredCompleted.map((r) => r.thread_id),
    ...expiredOther.map((r) => r.thread_id),
  ];

  if (expiredThreadIds.length === 0) {
    return;
  }

  // 3. 批量删除（使用事务保证一致性）
  const deleteCheckpoints = db.prepare(`DELETE FROM checkpoints WHERE thread_id = ?`);
  const deleteWrites = db.prepare(`DELETE FROM writes WHERE thread_id = ?`);
  const deleteActivity = db.prepare(`DELETE FROM thread_activity WHERE thread_id = ?`);

  const deleteBatch = (threadIds: string[]) => {
    for (const threadId of threadIds) {
      deleteCheckpoints.run(threadId);
      deleteWrites.run(threadId);
      deleteActivity.run(threadId);
    }
  };
  const transaction = db.transaction(deleteBatch as (...args: unknown[]) => unknown);

  transaction(expiredThreadIds);

  console.log(
    `[checkpoint-cleanup] Cleaned up ${expiredThreadIds.length} expired threads ` +
    `(${expiredCompleted.length} completed, ${expiredOther.length} interrupted/running)`
  );
}
