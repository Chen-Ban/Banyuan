/**
 * 相地 · Harness 模块
 *
 * Harness Engineering 的统一出口。
 * Harness 提供约束、反馈回路和人工介入节点。
 *
 * 组件：
 *   Guards      - 内置前置守卫（阻断不合规执行）
 *   Checkpoints - 内置后置检查点（验证结果）
 */

export { Guards, specApproved, hasAtLeastOneTask, noProhibitedKeywords, proposalComplete, customGuard } from "./guards.js";

export { Checkpoints, outputNotEmpty, outputMatchesPattern, allTasksDone, outputMinLength, customCheckpoint } from "./checkpoints.js";

export type {
  GuardResult,
  GuardFn,
  Guard,
  CheckpointResult,
  CheckpointFn,
  Checkpoint,
  HarnessContext,
  HarnessPhase,
  HarnessConfig,
  HarnessRunResult,
} from "./types.js";
