/**
 * CheckpointStore 抽象接口
 *
 * 将 LangGraph Checkpoint 持久化的框架细节封装在统一接口之后，
 * 使路由层和业务逻辑无需感知底层存储实现（SQLite / Memory / PostgreSQL 等）。
 *
 * 设计原则：
 * - 路由层只依赖此接口，不 import 任何具体存储库
 * - 具体实现由工厂函数根据环境配置选择和创建
 * - lifecycle 方法（start/stop）由 server.ts 在启动/关闭时调用
 */

import type { BaseCheckpointSaver } from '@langchain/langgraph'

// ─── Thread 活跃状态 ─────────────────────────────────────────────────────────────

export type ThreadStatus = 'running' | 'completed' | 'interrupted'

// ─── 清理配置 ────────────────────────────────────────────────────────────────────

export interface CleanupConfig {
  /** 已完成 thread 的保留时间（ms），默认 1 小时 */
  completedTTL: number
  /** 中断/运行中 thread 的保留时间（ms），默认 24 小时 */
  interruptedTTL: number
  /** 清理间隔（ms），默认 10 分钟 */
  interval: number
}

export const DEFAULT_CLEANUP_CONFIG: CleanupConfig = {
  completedTTL: 60 * 60 * 1000, // 1 hour
  interruptedTTL: 24 * 60 * 60 * 1000, // 24 hours
  interval: 10 * 60 * 1000, // 10 minutes
}

// ─── CheckpointStore 接口 ────────────────────────────────────────────────────────

export interface CheckpointStore {
  /**
   * 获取 LangGraph BaseCheckpointSaver 实例。
   * 路由层将此实例传入 `createMasterGraph({ checkpointer })`。
   */
  getCheckpointer(): BaseCheckpointSaver

  /**
   * 记录 thread 活跃状态（每次 invoke/resume/interrupt 时调用）。
   * 用于 TTL 清理的判断依据。
   */
  recordActivity(threadId: string, status: ThreadStatus): void

  /**
   * 启动 store（含清理定时任务等后台工作）。
   * 应在服务监听成功后调用。
   */
  start(): void

  /**
   * 停止 store（释放连接、停止定时器）。
   * 应在 graceful shutdown 时调用。
   */
  stop(): Promise<void>

  /** 存储后端标识（用于日志） */
  readonly backend: string
}
