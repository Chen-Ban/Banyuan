/**
 * @module graph/resume/types
 * @description 中断/续接策略的类型定义（ADR-034）
 *
 * 定义 ResumeClassifier 分类结果、中断快照、修正上下文等核心类型，
 * 支撑 MasterGraph 在用户中断后根据意图选择 continue/refine/restart/clarify 路径。
 */

import type { AgentRole, FeatureList, TechPlan, VisualSpec } from '../../spec/planningTypes.js';
import type { ChangeSpec } from '../../spec/types.js';

// ─── Resume Intent ───────────────────────────────────────────────────────────

/** 四种中断续接意图 */
export type ResumeIntent = 'continue' | 'refine' | 'restart' | 'clarify';

/** ResumeClassifier 的分类结果 */
export interface ResumeClassification {
  intent: ResumeIntent;
  /** 受影响的 Agent（仅 refine/clarify 时有值） */
  affectedAgent: AgentRole | null;
  /** 判断依据（一句话） */
  reasoning: string;
}

// ─── Completed Artifacts ─────────────────────────────────────────────────────

/** 已完成节点的产物记录 */
export interface CompletedArtifactEntry<T> {
  output: T;
  checkpointId: string;
  completedAt: number;
}

/** 所有已完成产物的集合 */
export interface CompletedArtifacts {
  pm?: CompletedArtifactEntry<FeatureList>;
  arch?: CompletedArtifactEntry<TechPlan>;
  visual?: CompletedArtifactEntry<VisualSpec>;
  task?: CompletedArtifactEntry<ChangeSpec>;
}

// ─── Partial Agent State ─────────────────────────────────────────────────────

/** 中断时正在执行的 Agent 的部分状态 */
export interface PartialAgentState {
  agent: AgentRole;
  /** LangGraph checkpoint ID，用于恢复 */
  checkpointId: string;
  /** 当前迭代次数 */
  iteration: number;
  /** 中断时间 */
  interruptedAt: number;
}

// ─── Planning Snapshot ───────────────────────────────────────────────────────

/** 中断时的完整状态快照 */
export interface PlanningSnapshot {
  /** 中断发生时正在执行的节点 */
  interruptedAt: AgentRole | 'execute';
  /** 已完成节点及其产物 */
  completedArtifacts: CompletedArtifacts;
  /** 中断时正在执行的节点的部分状态 */
  partialState?: PartialAgentState;
  /** 中断时间 */
  interruptedAt_ts: number;
  /** 关联的 Dialogue ID */
  dialogueId?: string;
  /** 原始方案概述（用于 ResumeClassifier 上下文） */
  planDescription?: string;
}

// ─── Refinement Context ──────────────────────────────────────────────────────

/** 修正/补充上下文（refine/clarify 恢复时注入） */
export interface RefinementContext {
  /** 上一次该 Agent 的产出（供参考） */
  previousOutput?: unknown;
  /** 用户的修正/补充消息 */
  userRefinement: string;
  /** 注入到 Agent 的额外指令 */
  instruction: string;
}

