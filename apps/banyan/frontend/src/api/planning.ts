/**
 * Planning API 客户端
 *
 * 提供 Agent Prompt 配置 CRUD。
 */

import { get, put, del } from './client'
import type { ApiResponse } from './client'

// ─── 类型定义 ──────────────────────────────────────────────────────────────────

/** Agent 角色（含 master） */
export type FullAgentRole = 'master' | 'pm' | 'arch' | 'visual' | 'task'

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
