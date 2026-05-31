/**
 * 相地 · SubAgent 通用状态定义
 *
 * 每个规划子 Agent 拥有独立状态，不共享主图 MasterState。
 */

import type { Message } from '../../core/types.js';
import type { AgentRole, FeatureList, TechPlan, VisualSpec } from '../../spec/planningTypes.js';

/** SubAgent LLM 配置 */
export interface SubAgentLLMConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  /** think↔tools 循环上限（纯 LLM Agent 设为 1） */
  maxIterations: number;
}

/** SubAgent 通用状态 */
export interface SubAgentState<TInput, TOutput> {
  input: TInput;
  systemPrompt: string;
  agentMemory: string;
  conversationContext: string;
  messages: Message[];
  iteration: number;
  maxIterations: number;
  output: TOutput | null;
  reasoning: string;
  error?: string;
}

/** PMAgent 输入 */
export interface PMAgentInput {
  userMessage: string;
  previousFeatureList?: FeatureList;
  conversationContext: string;
}

/** ArchAgent 输入 */
export interface ArchAgentInput {
  featureList: FeatureList;
  previousTechPlan?: TechPlan;
}

/** VisualAgent 输入 */
export interface VisualAgentInput {
  featureList: FeatureList;
  techPlan: TechPlan;
  previousVisualSpec?: VisualSpec;
}

/** TaskPlannerAgent 输入 */
export interface TaskPlannerInput {
  featureList: FeatureList;
  techPlan: TechPlan;
  visualSpec: VisualSpec;
}
