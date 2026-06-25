/**
 * 内存实现的 CheckpointStore
 *
 * 适用于开发调试和单元测试场景。不产生任何文件系统副作用，
 * 进程重启后状态丢失。
 *
 * 通过设置 CHECKPOINT_BACKEND=memory 启用。
 */

import { MemorySaver } from '@langchain/langgraph'
import type { BaseCheckpointSaver } from '@langchain/langgraph'
import type { CheckpointStore, ThreadStatus } from './types.js'

export class MemoryCheckpointStore implements CheckpointStore {
  readonly backend = 'memory'

  private saver: MemorySaver | null = null
  private activity: Map<string, { status: ThreadStatus; lastActiveAt: number }> = new Map()

  getCheckpointer(): BaseCheckpointSaver {
    if (!this.saver) {
      this.saver = new MemorySaver()
    }
    return this.saver
  }

  recordActivity(threadId: string, status: ThreadStatus): void {
    this.activity.set(threadId, { status, lastActiveAt: Date.now() })
  }

  start(): void {
    console.log('[MemoryCheckpointStore] Started (in-memory, no persistence)')
  }

  async stop(): Promise<void> {
    this.saver = null
    this.activity.clear()
  }
}
