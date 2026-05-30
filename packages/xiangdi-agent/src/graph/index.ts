/**
 * 相地 · LangGraph 图定义模块
 */
export { MasterStateAnnotation, ExecuteStateAnnotation } from "./state.js";
export type { MasterState, ExecuteState, PlanTask, PlanOutput } from "./state.js";
export { createMasterGraph } from "./masterGraph.js";
export type { MasterGraphConfig } from "./masterGraph.js";
export { createChatGraph, ChatStateAnnotation } from "./chatGraph.js";
export type { ChatGraphConfig, ChatState } from "./chatGraph.js";
export { buildSpecSystemPrompt, loadSpecPrompt, createExtractMemoryNode } from "./nodes/index.js";
export type { SpecNodeConfig, ExtractMemoryConfig, MemoryNodeState } from "./nodes/index.js";

// ─── Multi-Agent Planning（ADR-032/033/034）──────────────────────────────────
export {
  PlanningOrchestrator,
  runSubAgent,
  runPMAgent,
  runArchAgent,
  runVisualAgent,
  runTaskPlannerAgent,
  buildPMContext,
  buildArchContext,
  buildVisualContext,
  buildTaskContext,
  buildContextSummary,
} from "./planningAgents/index.js";

export type {
  PlanningOrchestratorConfig,
  PlanningResult,
  PlanningRunOptions,
  SubAgentConfig,
  SubAgentRunResult,
  SubAgentLLMConfig,
  SubAgentState,
  PMAgentInput,
  PMAgentConfig,
  ArchAgentInput,
  ArchAgentConfig,
  VisualAgentInput,
  VisualAgentConfig,
  TaskPlannerInput,
  TaskPlannerAgentConfig,
  TokenBudget,
} from "./planningAgents/index.js";

// ─── Resume（中断续接，ADR-034）──────────────────────────────────────────────
export {
  PLANNING_DAG,
  getDownstream,
  getDirectDownstream,
  getValidArtifacts,
  getResumeStartAgent,
  getInvalidatedAgents,
  classifyResumeIntent,
  handleContinue,
  handleRefine,
  handleRestart,
  handleClarify,
} from "./resume/index.js";

export type {
  ResumeIntent,
  ResumeClassification,
  CompletedArtifactEntry,
  CompletedArtifacts,
  PartialAgentState,
  PlanningSnapshot,
  RefinementContext,
  PlanningArtifactStatus,
  ResumeClassifierConfig,
  ResumeClassifierInput,
} from "./resume/index.js";
