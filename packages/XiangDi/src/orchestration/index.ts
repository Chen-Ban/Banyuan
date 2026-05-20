/**
 * 相地 · 编排层
 *
 * 并行 SubAgent 架构的公共导出。
 *
 * 使用方式：
 * ```ts
 * import { OrchestratorAgent } from "@banyuan/agent";
 *
 * const orchestrator = new OrchestratorAgent({ maxConcurrency: 4 });
 * const result = await orchestrator.orchestrate(client, {
 *   pageDescription: "用户登录页面",
 *   pageSize: { width: 375, height: 812 },
 * });
 * ```
 */

// ─── 核心类 ─────────────────────────────────────────────────────────────────
export { OrchestratorAgent } from "./OrchestratorAgent.js";
export { LayoutPlanner } from "./LayoutPlanner.js";
export { SubAgentRunner } from "./SubAgentRunner.js";
export { Assembler, AssemblyError } from "./Assembler.js";
export { AuditorAgent } from "./AuditorAgent.js";

// ─── 类型导出 ────────────────────────────────────────────────────────────────
export type { LayoutPlannerInput, LayoutPlannerResult } from "./LayoutPlanner.js";
export type { ProgressCallback } from "./SubAgentRunner.js";
export type { AssemblyDiagnostic } from "./Assembler.js";

// ─── 类型定义（从 types.ts 重导出）─────────────────────────────────────────
export { DEFAULT_ORCHESTRATION_CONFIG } from "./types.js";

export type {
  // Port 系统
  PortDirection,
  PortDataType,
  DataPort,
  EventPort,
  ContainerPorts,
  // SubAgent 任务
  ContainerRole,
  SubAgentTask,
  SubAgentConstraints,
  SubAgentContext,
  FlowFragment,
  SubAgentResult,
  DataUsageDeclaration,
  // 组装
  ContainerPlacement,
  DataBinding,
  EventWiring,
  AssemblyPlan,
  // 审计
  AuditSeverity,
  AuditIssue,
  AuditRequest,
  AuditResult,
  // 配置与事件
  OrchestrationConfig,
  OrchestrationPhase,
  OrchestrationProgressEvent,
  OrchestrationResult,
} from "./types.js";
