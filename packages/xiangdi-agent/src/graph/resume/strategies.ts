/**
 * 相地 · Resume 策略实现
 *
 * 根据 ResumeClassifier 的分类结果，执行不同的恢复策略。
 */

import type { AgentRole } from '../../spec/planningTypes.js';
import type { PlanningOrchestrator, PlanningResult, PlanningRunOptions } from '../planningAgents/PlanningOrchestrator.js';
import type { CompletedArtifacts, PlanningSnapshot, RefinementContext } from './types.js';
import { getDownstream, getValidArtifacts } from './invalidation.js';

// ─── Continue ────────────────────────────────────────────────────────────────

/**
 * 继续执行：从中断处继续（无修改）
 */
export async function handleContinue(
  orchestrator: PlanningOrchestrator,
  snapshot: PlanningSnapshot,
  options: PlanningRunOptions = {},
): Promise<PlanningResult> {
  const fromAgent = snapshot.interruptedAt === 'execute'
    ? 'task' as AgentRole
    : snapshot.interruptedAt;

  return orchestrator.runFrom(
    fromAgent,
    snapshot.completedArtifacts,
    undefined,
    '',
    options,
  );
}

// ─── Refine ──────────────────────────────────────────────────────────────────

/**
 * 修正方案：从受影响节点开始重新执行，注入修正上下文
 */
export async function handleRefine(
  orchestrator: PlanningOrchestrator,
  snapshot: PlanningSnapshot,
  affectedAgent: AgentRole,
  userMessage: string,
  options: PlanningRunOptions = {},
): Promise<PlanningResult> {
  // 计算失效范围
  const invalidated = getDownstream(affectedAgent);
  const validArtifacts = getValidArtifacts(snapshot.completedArtifacts, invalidated);

  // 构建修正上下文
  const previousOutput = snapshot.completedArtifacts[affectedAgent]?.output;
  const refinementContext: RefinementContext = {
    previousOutput,
    userRefinement: userMessage,
    instruction: `用户希望对你上一次的产出进行修正。上一次产出已提供，用户的修正意见如下：\n\n${userMessage}\n\n请在上一次产出的基础上进行调整。`,
  };

  return orchestrator.runFrom(
    affectedAgent,
    validArtifacts,
    refinementContext,
    userMessage,
    options,
  );
}

// ─── Restart ─────────────────────────────────────────────────────────────────

/**
 * 重新开始：忽略所有已有产物，从 PM 开始全新规划
 */
export async function handleRestart(
  orchestrator: PlanningOrchestrator,
  userMessage: string,
  options: PlanningRunOptions = {},
): Promise<PlanningResult> {
  return orchestrator.run(userMessage, options);
}

// ─── Clarify ─────────────────────────────────────────────────────────────────

/**
 * 确认意图后再执行
 *
 * 此函数在用户通过 UI 确认意图后被调用。
 * 根据确认结果分发到对应策略。
 */
export async function handleClarify(
  orchestrator: PlanningOrchestrator,
  snapshot: PlanningSnapshot,
  confirmedIntent: 'continue' | 'refine' | 'restart',
  affectedAgent: AgentRole | null,
  userMessage: string,
  options: PlanningRunOptions = {},
): Promise<PlanningResult> {
  switch (confirmedIntent) {
    case 'continue':
      return handleContinue(orchestrator, snapshot, options);
    case 'refine':
      if (!affectedAgent) {
        // 无法确定受影响节点，退回到 pm
        return handleRefine(orchestrator, snapshot, 'pm', userMessage, options);
      }
      return handleRefine(orchestrator, snapshot, affectedAgent, userMessage, options);
    case 'restart':
      return handleRestart(orchestrator, userMessage, options);
  }
}
