/**
 * 相地 · 规划子 Agent 模块
 *
 * 四个专业角色的独立子图 + 统一执行工厂。
 */

// State types
export type {
  SubAgentLLMConfig,
  SubAgentState,
  PMAgentInput,
  ArchAgentInput,
  VisualAgentInput,
  TaskPlannerInput,
} from './state.js';

// Factory
export { runSubAgent } from './factory.js';
export type { SubAgentConfig, SubAgentRunResult } from './factory.js';

// Individual agents
export { runPMAgent } from './PMAgent.js';
export type { PMAgentConfig } from './PMAgent.js';

export { runArchAgent } from './ArchAgent.js';
export type { ArchAgentConfig } from './ArchAgent.js';

export { runVisualAgent } from './VisualAgent.js';
export type { VisualAgentConfig } from './VisualAgent.js';

export { runTaskPlannerAgent } from './TaskPlannerAgent.js';
export type { TaskPlannerAgentConfig } from './TaskPlannerAgent.js';

// Orchestrator
export { PlanningOrchestrator } from './PlanningOrchestrator.js';
export type { PlanningOrchestratorConfig, PlanningResult, PlanningRunOptions } from './PlanningOrchestrator.js';

// Context builder
export {
  buildPMContext,
  buildArchContext,
  buildVisualContext,
  buildTaskContext,
  buildContextSummary,
} from './SubAgentContextBuilder.js';
export type { TokenBudget } from './SubAgentContextBuilder.js';
