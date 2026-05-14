/**
 * 相地 · Harness 模块
 *
 * Harness Engineering 的统一出口。
 * Harness 是包裹 AgentLoop 的外壳，提供约束、反馈回路和人工介入节点。
 *
 * Agent = Model + Harness
 *
 * 核心组件：
 *   HarnessRunner   - 主执行器，编排 Guards → HumanGates → AgentLoop → Checkpoints
 *   Guards          - 内置前置守卫（阻断不合规执行）
 *   Checkpoints     - 内置后置检查点（验证结果）
 *   HumanGates      - 内置人工介入节点（Human-in-the-Loop）
 */

export { HarnessRunner } from "./HarnessRunner.js";

export { Guards, specApproved, hasAtLeastOneTask, noProhibitedKeywords, proposalComplete, customGuard } from "./guards.js";

export { Checkpoints, outputNotEmpty, outputMatchesPattern, allTasksDone, outputMinLength, customCheckpoint } from "./checkpoints.js";

export { HumanGates, reviewProposal, reviewTasks, confirmResult, retryOnError } from "./humanGates.js";

export type {
  GuardResult,
  GuardFn,
  Guard,
  CheckpointResult,
  CheckpointFn,
  Checkpoint,
  HumanGateTrigger,
  HumanGate,
  HumanDecision,
  HarnessContext,
  HarnessPhase,
  HarnessConfig,
  HarnessRunResult,
} from "./types.js";
