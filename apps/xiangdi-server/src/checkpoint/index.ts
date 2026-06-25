/**
 * Checkpoint 模块公共入口
 *
 * 通过工厂函数根据环境变量创建 CheckpointStore 实例，
 * 对外暴露统一的抽象接口。
 *
 * 环境变量：
 * - CHECKPOINT_BACKEND: "sqlite" | "memory"，默认 "sqlite"
 * - CHECKPOINT_DB_PATH: SQLite 模式下的文件路径（默认 ./data/checkpoints.db）
 *
 * 使用方式：
 *   import { getStore } from './checkpoint/index.js'
 *   const store = getStore()
 *   const checkpointer = store.getCheckpointer()
 */

import type { CheckpointStore } from './types.js'
import { SqliteCheckpointStore } from './SqliteCheckpointStore.js'
import { MemoryCheckpointStore } from './MemoryCheckpointStore.js'
import { logger } from '../logger.js'

export type { CheckpointStore, ThreadStatus, CleanupConfig } from './types.js'

// ─── 全局单例 ────────────────────────────────────────────────────────────────────

let _store: CheckpointStore | null = null

/**
 * 创建或获取 CheckpointStore 全局单例。
 * 首次调用时根据 CHECKPOINT_BACKEND 环境变量决定使用哪种实现。
 */
export function getStore(): CheckpointStore {
  if (!_store) {
    _store = createStore()
  }
  return _store
}

/**
 * 工厂函数：根据环境配置创建对应的 CheckpointStore 实现。
 */
function createStore(): CheckpointStore {
  const backend = process.env.CHECKPOINT_BACKEND ?? 'sqlite'

  switch (backend) {
    case 'memory':
      return new MemoryCheckpointStore()

    case 'sqlite':
      return new SqliteCheckpointStore()

    default:
      logger.warn(`Unknown CHECKPOINT_BACKEND="${backend}", falling back to sqlite`)
      return new SqliteCheckpointStore()
  }
}

// ─── 兼容性导出（逐步废弃） ─────────────────────────────────────────────────────

/**
 * @deprecated 使用 `getStore().getCheckpointer()` 代替
 */
export function getCheckpointer() {
  return getStore().getCheckpointer()
}

/**
 * @deprecated 使用 `getStore().stop()` 代替
 */
export async function closeCheckpointer(): Promise<void> {
  if (_store) {
    await _store.stop()
    _store = null
  }
}
