/**
 * 相地 · 编排层
 *
 * 并行 SubAgent 架构的类型定义与配置导出。
 * 实际执行由 MasterGraph 的 plan/execute/audit 节点驱动。
 */

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
