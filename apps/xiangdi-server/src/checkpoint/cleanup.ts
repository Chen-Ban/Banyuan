/**
 * 相地服务 · Checkpoint TTL 清理
 *
 * 定期扫描过期的 checkpoint thread 并清理，防止 SQLite 文件无限膨胀。
 */

import { getCheckpointer } from "./index.js";

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

// ─── 清理逻辑 ──────────────────────────────────────────────────────────────────

let _cleanupTimer: ReturnType<typeof setInterval> | null = null;

/**
 * 启动 checkpoint 清理定时任务
 */
export function startCheckpointCleanup(config: Partial<CleanupConfig> = {}): void {
  const { completedTTL, interruptedTTL, interval } = { ...DEFAULT_CONFIG, ...config };

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
 * 注意：SqliteSaver 暂不提供 list all threads 的 API，
 * 此处预留接口，待 LangGraph SDK 支持后实现。
 * MVP 阶段通过 SQLite 直接查询实现。
 */
async function cleanupExpiredThreads(
  _completedTTL: number,
  _interruptedTTL: number
): Promise<void> {
  // TODO: 实现基于 SQLite 的过期 thread 清理
  // 当 @langchain/langgraph-checkpoint-sqlite 提供 list/delete API 时替换
  // 临时方案：直接操作底层 SQLite 表
  const _checkpointer = getCheckpointer();
  // Phase 1 MVP: 暂不实现自动清理，依赖手动清理或 cron 脚本
}
