/**
 * 相地 · Harness 类型定义
 *
 * Harness Engineering 的核心契约。
 *
 * Harness（缰绳）是包裹 AgentLoop 的外壳，提供：
 *   - Guard（守卫）：执行前的前置检查，可阻断执行
 *   - Checkpoint（检查点）：执行后的后置验证，可触发回滚
 *   - HumanGate（人工介入节点）：暂停等待人工确认
 *   - Rollback（回滚）：检查点失败时的恢复策略
 *
 * 设计原则：
 *   - Harness 是外壳，不侵入 AgentLoop 内部逻辑
 *   - Agent = Model + Harness
 *   - 每个 Guard / Checkpoint 是独立的、可组合的函数
 */

import type { ChangeSpec } from "../spec/types.js";

// ─── Guard（守卫）────────────────────────────────────────────────────────────

/**
 * Guard 的执行结果
 */
export interface GuardResult {
  /** 是否通过 */
  passed: boolean;
  /** 未通过时的原因说明 */
  reason?: string;
  /** 建议的修复动作（可选，供 Harness 自动修复使用） */
  suggestion?: string;
}

/**
 * Guard 函数签名
 * 在 AgentLoop 执行前运行，返回 false 则阻断执行
 *
 * @param context 当前执行上下文
 */
export type GuardFn = (context: HarnessContext) => Promise<GuardResult>;

/**
 * 具名 Guard，便于日志和调试
 */
export interface Guard {
  name: string;
  description?: string;
  fn: GuardFn;
}

// ─── Checkpoint（检查点）─────────────────────────────────────────────────────

/**
 * Checkpoint 的执行结果
 */
export interface CheckpointResult {
  /** 是否通过 */
  passed: boolean;
  /** 未通过时的原因说明 */
  reason?: string;
  /**
   * 是否需要回滚
   * 若为 true，Harness 将调用对应的 rollback 函数
   */
  needsRollback?: boolean;
}

/**
 * Checkpoint 函数签名
 * 在 AgentLoop 执行后运行，验证结果是否符合预期
 *
 * @param context 当前执行上下文（含执行结果）
 */
export type CheckpointFn = (context: HarnessContext) => Promise<CheckpointResult>;

/**
 * 具名 Checkpoint
 */
export interface Checkpoint {
  name: string;
  description?: string;
  fn: CheckpointFn;
  /** 检查点失败时的回滚函数（可选） */
  rollback?: (context: HarnessContext) => Promise<void>;
}

// ─── HumanGate（人工介入节点）────────────────────────────────────────────────

/**
 * 人工介入节点的触发时机
 */
export type HumanGateTrigger =
  | "before_run"      // 执行前（如：审核 ChangeSpec 的 proposal）
  | "after_planning"  // 规划完成后（如：审核 tasks 列表）
  | "after_run"       // 执行后（如：确认结果）
  | "on_error";       // 出错时

/**
 * 人工介入节点
 * Harness 在此节点暂停，等待外部（用户/系统）提供决策
 */
export interface HumanGate {
  trigger: HumanGateTrigger;
  /**
   * 向用户展示的提示信息
   * 支持函数形式，可根据上下文动态生成
   */
  prompt: string | ((context: HarnessContext) => string);
  /**
   * 处理用户决策的回调
   * 返回 true 表示继续，false 表示中止
   */
  onDecision: (decision: HumanDecision, context: HarnessContext) => Promise<boolean>;
}

/**
 * 人工决策
 */
export interface HumanDecision {
  /** 是否批准继续 */
  approved: boolean;
  /** 用户的附加说明或修改意见 */
  comment?: string;
  /** 用户对 ChangeSpec 的修改（可选） */
  specPatch?: Partial<ChangeSpec>;
}

// ─── HarnessContext（执行上下文）─────────────────────────────────────────────

/**
 * Harness 执行上下文
 * 在整个 Harness 生命周期中传递，Guards 和 Checkpoints 通过它访问状态
 */
export interface HarnessContext {
  /** 当前变更 Spec */
  changeSpec: ChangeSpec;
  /** 当前执行阶段 */
  phase: HarnessPhase;
  /** AgentLoop 的执行结果（仅在 after_run 阶段可用） */
  result?: string;
  /** 执行过程中的错误（仅在 on_error 阶段可用） */
  error?: Error;
  /** 自定义元数据，供 Guards/Checkpoints 之间传递信息 */
  metadata: Record<string, unknown>;
}

/**
 * Harness 的执行阶段
 */
export type HarnessPhase =
  | "idle"
  | "guarding"      // 正在运行 Guards
  | "waiting_human" // 等待人工介入
  | "running"       // AgentLoop 执行中
  | "checkpointing" // 正在运行 Checkpoints
  | "done"
  | "aborted"
  | "error";

// ─── HarnessConfig（配置）────────────────────────────────────────────────────

/**
 * Harness 配置
 */
export interface HarnessConfig {
  /** 前置守卫列表（按顺序执行，任一失败则阻断） */
  guards?: Guard[];
  /** 后置检查点列表（按顺序执行） */
  checkpoints?: Checkpoint[];
  /** 人工介入节点列表 */
  humanGates?: HumanGate[];
  /**
   * 是否在所有 Guards 通过后自动执行（不等待人工确认）
   * 默认 false（需要人工确认 before_run 节点）
   */
  autoRun?: boolean;
  /**
   * 最大重试次数（Checkpoint 失败后）
   * 默认 0（不重试）
   */
  maxRetries?: number;
}

// ─── HarnessRunResult ─────────────────────────────────────────────────────────

/**
 * Harness 运行结果
 */
export interface HarnessRunResult {
  /** 是否成功完成 */
  success: boolean;
  /** AgentLoop 的最终输出 */
  output?: string;
  /** 失败原因 */
  failureReason?: string;
  /** 被哪个 Guard 阻断（若有） */
  blockedBy?: string;
  /** 哪个 Checkpoint 失败（若有） */
  failedCheckpoint?: string;
  /** 是否被人工中止 */
  abortedByHuman?: boolean;
  /** 执行耗时（ms） */
  durationMs: number;
}
