/**
 * 相地 · 失效传播
 *
 * 基于规划管线的 DAG 拓扑，计算某节点修改后下游需要重新执行的节点。
 * 支撑 ADR-034 中断续接的 refine 策略。
 */

import type { AgentRole } from '../../spec/planningTypes.js';
import type { CompletedArtifacts } from './types.js';

// ─── DAG 定义 ─────────────────────────────────────────────────────────────────

/**
 * 规划管线的拓扑序（单链 DAG）
 * pm → arch → visual → task
 */
export const PLANNING_DAG: readonly AgentRole[] = ['pm', 'arch', 'visual', 'task'] as const;

/**
 * 直接下游关系映射
 */
const DOWNSTREAM_MAP: Record<AgentRole, AgentRole[]> = {
  pm: ['arch', 'visual', 'task'],
  arch: ['visual', 'task'],
  visual: ['task'],
  task: [],
};

// ─── 失效传播函数 ─────────────────────────────────────────────────────────────

/**
 * 获取受影响 Agent 的所有下游节点（含自身）
 *
 * @param affectedAgent - 被修改的 Agent
 * @returns 需要重新执行的节点列表（按拓扑序）
 */
export function getDownstream(affectedAgent: AgentRole): AgentRole[] {
  return [affectedAgent, ...DOWNSTREAM_MAP[affectedAgent]];
}

/**
 * 获取指定 Agent 的直接下游节点（不含自身）
 */
export function getDirectDownstream(affectedAgent: AgentRole): AgentRole[] {
  return DOWNSTREAM_MAP[affectedAgent];
}

/**
 * 从快照中过滤出仍然有效的产物
 *
 * @param completedArtifacts - 完整的已完成产物
 * @param invalidatedAgents - 被标记为失效的 Agent 列表
 * @returns 仅包含有效产物的子集
 */
export function getValidArtifacts(
  completedArtifacts: CompletedArtifacts,
  invalidatedAgents: AgentRole[],
): CompletedArtifacts {
  const valid: CompletedArtifacts = { ...completedArtifacts };

  for (const agent of invalidatedAgents) {
    delete valid[agent];
  }

  return valid;
}

/**
 * 确定恢复执行的起始 Agent
 *
 * @param affectedAgent - 受影响/需修改的 Agent
 * @returns 管线中应该从哪个 Agent 开始重新执行
 */
export function getResumeStartAgent(affectedAgent: AgentRole): AgentRole {
  return affectedAgent;
}

/**
 * 计算两个产物集之间的差异（哪些需要重做）
 */
export function getInvalidatedAgents(
  affectedAgent: AgentRole,
): AgentRole[] {
  return getDownstream(affectedAgent);
}
