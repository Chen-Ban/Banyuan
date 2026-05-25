/**
 * 相地服务 · Checkpoint 持久化模块
 *
 * 使用 LangGraph SqliteSaver 实现 MasterGraph 的执行状态持久化。
 * 每个节点完成后自动 checkpoint，支持连接断开后恢复执行。
 *
 * 存储位置：./data/checkpoints.db（相对于 xiangdi-server 工作目录）
 */

import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// ─── 配置 ──────────────────────────────────────────────────────────────────────

const CHECKPOINT_DB_PATH = process.env.CHECKPOINT_DB_PATH || "./data/checkpoints.db";

// ─── 初始化 ──────────────────────────────────────────────────────────────────────

/** 确保存储目录存在 */
function ensureDataDir(): void {
  const dir = dirname(CHECKPOINT_DB_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/** 全局 checkpointer 单例 */
let _checkpointer: SqliteSaver | null = null;

/**
 * 获取 Checkpointer 实例（懒初始化单例）
 */
export function getCheckpointer(): SqliteSaver {
  if (!_checkpointer) {
    ensureDataDir();
    _checkpointer = SqliteSaver.fromConnString(CHECKPOINT_DB_PATH);
  }
  return _checkpointer;
}

/**
 * 关闭 Checkpointer 连接（进程退出时调用）
 */
export async function closeCheckpointer(): Promise<void> {
  if (_checkpointer) {
    // SqliteSaver 没有显式 close 方法，置空即可
    _checkpointer = null;
  }
}
