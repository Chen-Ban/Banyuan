/**
 * Planning API 客户端
 *
 * 提供 Multi-Agent 规划产物查询和 Agent Prompt 配置 CRUD。
 */

import { get, put, del } from './client'
import type { ApiResponse } from './client'
import type { AgentRole } from './ai'

// ─── 类型定义 ──────────────────────────────────────────────────────────────────

/** Agent 角色（含 master） */
export type FullAgentRole = 'master' | 'pm' | 'arch' | 'visual' | 'task'

/** 单个 Agent 的产出条目 */
export interface ArtifactEntry {
  agent: AgentRole
  output: unknown
  reasoning?: string
  tokenUsage: { input: number; output: number }
  durationMs: number
  createdAt: string
}

/** 规划产物状态 */
export type PlanningArtifactStatus =
  | 'running'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'interrupted'
  | 'abandoned'

/** 规划产物（对应后端 IPlanningArtifact） */
export interface PlanningArtifact {
  _id: string
  appId: string
  dialogueId: string
  featureList?: ArtifactEntry
  techPlan?: ArtifactEntry
  visualSpec?: ArtifactEntry
  changeSpec?: ArtifactEntry
  status: PlanningArtifactStatus
  failedAt?: AgentRole
  startedAt: string
  completedAt?: string
}

/** Agent Prompt 配置（对应后端 IAgentPrompt） */
export interface AgentPromptConfig {
  _id: string
  appId: string
  agent: FullAgentRole
  promptText: string
  isCustomized: boolean
  systemVersion: number
  createdAt: string
  updatedAt: string
}

// ─── 规划产物查询 ──────────────────────────────────────────────────────────────

/**
 * 获取某对话关联的规划产物
 */
export async function getArtifactByDialogue(
  appId: string,
  dialogueId: string
): Promise<PlanningArtifact | null> {
  const res = await get<ApiResponse<PlanningArtifact>>(
    `/applications/${appId}/planning/artifact/${dialogueId}`
  )
  return res.data ?? null
}

/**
 * 获取应用最近完成的规划产物
 */
export async function getLatestArtifact(
  appId: string
): Promise<PlanningArtifact | null> {
  const res = await get<ApiResponse<PlanningArtifact | null>>(
    `/applications/${appId}/planning/artifact-latest`
  )
  return res.data ?? null
}

// ─── Agent Prompt 配置 CRUD ─────────────────────────────────────────────────────

/**
 * 获取应用全部角色的 prompt 配置
 */
export async function listPrompts(appId: string): Promise<AgentPromptConfig[]> {
  const res = await get<ApiResponse<AgentPromptConfig[]>>(
    `/applications/${appId}/prompts`
  )
  return res.data ?? []
}

/**
 * 获取某角色的 prompt 配置
 */
export async function getPrompt(
  appId: string,
  agent: FullAgentRole
): Promise<AgentPromptConfig | null> {
  const res = await get<ApiResponse<AgentPromptConfig | null>>(
    `/applications/${appId}/prompts/${agent}`
  )
  return res.data ?? null
}

/**
 * 更新某角色的 prompt 配置
 */
export async function upsertPrompt(
  appId: string,
  agent: FullAgentRole,
  promptText: string
): Promise<AgentPromptConfig> {
  const res = await put<ApiResponse<AgentPromptConfig>>(
    `/applications/${appId}/prompts/${agent}`,
    { promptText }
  )
  return res.data!
}

/**
 * 批量更新角色配置
 */
export async function batchUpsertPrompts(
  appId: string,
  prompts: Array<{ agent: FullAgentRole; promptText: string }>
): Promise<AgentPromptConfig[]> {
  const res = await put<ApiResponse<AgentPromptConfig[]>>(
    `/applications/${appId}/prompts`,
    { prompts }
  )
  return res.data ?? []
}

/**
 * 重置某角色配置为系统默认
 */
export async function resetPrompt(
  appId: string,
  agent: FullAgentRole
): Promise<void> {
  await del<ApiResponse>(`/applications/${appId}/prompts/${agent}`)
}
