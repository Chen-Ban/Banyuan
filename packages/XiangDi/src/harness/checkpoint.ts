/**
 * 相地 · Harness Checkpoint（断点持久化）
 *
 * 在 HumanGate 触发时，将 HarnessRunner 的执行状态序列化到外部存储。
 * 进程重启后，通过 runId 恢复状态，从断点继续执行。
 *
 * 设计原则：
 *   - 只在 HumanGate 触发时做 checkpoint（天然的安全序列化点）
 *   - AgentLoop 不感知 checkpoint，序列化发生在 HarnessRunner 层
 *   - 序列化内容：消息历史 + ChangeSpec + 当前 phase + gate prompt
 *
 * 恢复流程：
 *   1. POST /ai/resume/:runId 携带 HumanDecision
 *   2. 从 CheckpointStore 读取 HarnessCheckpoint
 *   3. 重建 ContextManager（注入 messages）
 *   4. 重建 AgentLoop，跳过已完成的 phase，直接注入 decision 继续
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │  HarnessRunner.run()                                        │
 * │    Phase 1: Guards                                          │
 * │    Phase 2: HumanGate(before_run)                           │
 * │      → checkpoint({ phase: "before_run", messages: [] })   │
 * │      → 挂起，等待 /ai/resume/:runId                         │
 * │    Phase 3: AgentLoop.run()                                 │
 * │    Phase 4: Checkpoints                                     │
 * │    Phase 5: HumanGate(after_run)                            │
 * │      → checkpoint({ phase: "after_run", messages: [...] }) │
 * │      → 挂起，等待 /ai/resume/:runId                         │
 * └─────────────────────────────────────────────────────────────┘
 */

import type { Message } from "../core/types.js";
import type { ChangeSpec } from "../spec/types.js";
import type { HumanGateTrigger } from "./types.js";

// ─── HarnessCheckpoint（序列化状态）──────────────────────────────────────────

/**
 * Harness 在 HumanGate 触发时保存的完整状态快照
 */
export interface HarnessCheckpoint {
  /** 运行唯一标识（由调用方生成，贯穿整个 run 生命周期） */
  runId: string;
  /** 当前等待的 HumanGate 触发时机 */
  waitingAt: HumanGateTrigger;
  /** 展示给用户的提示信息 */
  gatePrompt: string;
  /** 当前 ChangeSpec（可能已被前置 HumanGate 修改） */
  changeSpec: ChangeSpec;
  /**
   * AgentLoop 执行到此时的完整消息历史
   * - before_run 时为空数组（AgentLoop 尚未执行）
   * - after_run 时包含完整的对话历史
   */
  messages: Message[];
  /**
   * AgentLoop 的最终输出（仅 after_run 时有值）
   */
  agentOutput?: string;
  /** checkpoint 创建时间（ms） */
  createdAt: number;
  /**
   * 超时时间（ms 时间戳）
   * 超过此时间未恢复，视为过期，自动 abort
   */
  expiresAt: number;
  /** checkpoint 状态 */
  status: "pending" | "resumed" | "expired" | "aborted";
}

// ─── CheckpointStore 接口 ─────────────────────────────────────────────────────

/**
 * Checkpoint 存储接口
 * 可以是内存、文件系统、Redis、数据库等不同实现
 */
export interface CheckpointStore {
  /**
   * 保存 checkpoint
   * 若已存在相同 runId 的 checkpoint，覆盖之
   */
  save(checkpoint: HarnessCheckpoint): Promise<void>;

  /**
   * 读取 checkpoint
   * @returns checkpoint，若不存在或已过期则返回 null
   */
  load(runId: string): Promise<HarnessCheckpoint | null>;

  /**
   * 将 checkpoint 标记为已恢复
   * 防止同一 runId 被重复恢复
   */
  markResumed(runId: string): Promise<void>;

  /**
   * 将 checkpoint 标记为已中止
   */
  markAborted(runId: string): Promise<void>;

  /**
   * 清理过期的 checkpoint
   * 建议定期调用（如每小时一次）
   */
  cleanup(): Promise<void>;
}
