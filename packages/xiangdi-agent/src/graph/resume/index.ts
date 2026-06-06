/**
 * 相地 · 中断续接模块
 *
 * 支撑 ADR-034 定义的 Interrupt/Resume 机制。
 */

// Types
export type {
  ResumeIntent,
  ResumeClassification,
  CompletedArtifactEntry,
  CompletedArtifacts,
  PartialAgentState,
  PlanningSnapshot,
  RefinementContext,
} from './types.js';

// Invalidation
export {
  PLANNING_DAG,
  getDownstream,
  getDirectDownstream,
  getValidArtifacts,
  getResumeStartAgent,
  getInvalidatedAgents,
} from './invalidation.js';

// ResumeClassifier
export { classifyResumeIntent } from './ResumeClassifier.js';
export type { ResumeClassifierConfig, ResumeClassifierInput } from './ResumeClassifier.js';

// Strategies
export {
  handleContinue,
  handleRefine,
  handleRestart,
  handleClarify,
} from './strategies.js';
