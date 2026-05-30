/**
 * 规划产物服务（PlanningArtifactService）
 *
 * 管理 Multi-Agent 规划管线产出的 CRUD 操作。
 * 供 AiService 在 SSE 代理过程中调用：
 *   - 创建空壳 artifact（规划开始时）
 *   - 逐步写入各 Agent 的产出（planning_progress 事件）
 *   - 标记完成/失败/中断状态
 *   - 查询最近完成的 artifact（供 previousArtifact 注入）
 */

import { Types } from 'mongoose'
import { PlanningArtifact } from '../models/index.js'
import type {
  IPlanningArtifact,
  IArtifactEntry,
  IPlanningSnapshot,
  AgentRole,
  PlanningArtifactStatus,
} from '../models/index.js'

class PlanningArtifactService {
  /**
   * 创建空壳 PlanningArtifact（规划开始时调用）
   */
  async create(appId: string, dialogueId: Types.ObjectId): Promise<IPlanningArtifact> {
    const artifact = new PlanningArtifact({
      appId,
      dialogueId,
      status: 'running',
      startedAt: new Date(),
    })
    await artifact.save()
    return artifact
  }

  /**
   * 写入某个 Agent 的产出
   */
  async writeAgentOutput(
    artifactId: Types.ObjectId,
    agent: AgentRole,
    entry: Omit<IArtifactEntry, 'agent' | 'createdAt'>
  ): Promise<void> {
    const fieldMap: Record<AgentRole, string> = {
      pm: 'featureList',
      arch: 'techPlan',
      visual: 'visualSpec',
      task: 'changeSpec',
    }
    const field = fieldMap[agent]

    const fullEntry: IArtifactEntry = {
      agent,
      output: entry.output,
      reasoning: entry.reasoning,
      tokenUsage: entry.tokenUsage,
      durationMs: entry.durationMs,
      createdAt: new Date(),
    }

    await PlanningArtifact.findByIdAndUpdate(artifactId, {
      $set: { [field]: fullEntry },
    })
  }

  /**
   * 更新 artifact 状态
   */
  async updateStatus(
    artifactId: Types.ObjectId,
    status: PlanningArtifactStatus,
    extra?: { failedAt?: AgentRole; completedAt?: Date; snapshot?: IPlanningSnapshot }
  ): Promise<void> {
    const update: Record<string, unknown> = { status }
    if (extra?.failedAt) update.failedAt = extra.failedAt
    if (extra?.completedAt) update.completedAt = extra.completedAt
    if (extra?.snapshot) update.snapshot = extra.snapshot

    await PlanningArtifact.findByIdAndUpdate(artifactId, { $set: update })
  }

  /**
   * 通过 dialogueId 查询关联的 PlanningArtifact
   */
  async getByDialogueId(dialogueId: Types.ObjectId): Promise<IPlanningArtifact | null> {
    return PlanningArtifact.findOne({ dialogueId }).lean() as unknown as IPlanningArtifact | null
  }

  /**
   * 通过 ID 查询
   */
  async getById(artifactId: Types.ObjectId | string): Promise<IPlanningArtifact | null> {
    return PlanningArtifact.findById(artifactId).lean() as unknown as IPlanningArtifact | null
  }

  /**
   * 查询某应用最近一次已完成的 PlanningArtifact
   * （用于 previousArtifact 注入——SubAgentContextBuilder 的 L3 层）
   */
  async getLatestCompleted(appId: string): Promise<IPlanningArtifact | null> {
    return PlanningArtifact.findOne({
      appId,
      status: 'completed',
    }).sort({ completedAt: -1 }).lean() as unknown as IPlanningArtifact | null
  }
}

export default new PlanningArtifactService()
