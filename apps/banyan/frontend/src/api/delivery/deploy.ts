/**
 * 部署 API（ADR-028）
 */

import { get, post } from '../client'
import type { ApiResponse } from '../client'

// ─── 类型 ─────────────────────────────────────────────────────────────────────

export type DeployStatus = 'pending' | 'building' | 'deploying' | 'success' | 'failed'
export type DeployType = 'static' | 'fullstack'
export type ProvisionStatus =
  | 'none'
  | 'pending'
  | 'creating_ecs'
  | 'configuring_dns'
  | 'initializing'
  | 'installing_agent'
  | 'ready'
  | 'failed'

export interface DeploymentRecord {
  deploymentId: string
  applicationId: string
  tenantId: string
  version: number
  deployType: DeployType
  status: DeployStatus
  currentStep?: string
  progress: number
  url?: string
  error?: string
  triggeredBy: string
  startedAt?: string
  finishedAt?: string
  createdAt: string
  updatedAt: string
}

export interface AgentStatus {
  online: boolean
  provisionStatus: ProvisionStatus
  domain?: string
}

export interface PublishResult {
  deploymentId: string
  status: DeployStatus
  message: string
}

// ─── API 调用 ─────────────────────────────────────────────────────────────────

/**
 * 发布应用到 Web
 */
export function publishApp(applicationId: string, deployType: DeployType = 'static') {
  return post<ApiResponse<PublishResult>>('/deploy/publish', { applicationId, deployType })
}

/**
 * 查询部署状态
 */
export function getDeployStatus(deploymentId: string) {
  return get<ApiResponse<DeploymentRecord>>(`/deploy/status/${deploymentId}`)
}

/**
 * 查询应用部署历史
 */
export function getDeployHistory(applicationId: string, limit = 20) {
  return get<ApiResponse<DeploymentRecord[]>>(`/deploy/history/${applicationId}`, { limit })
}

/**
 * 查询 agent 在线状态
 */
export function getAgentStatus() {
  return get<ApiResponse<AgentStatus>>('/deploy/agent-status')
}

/** 查询当月 credit 用量 */
export function getCreditUsage() {
  return get<ApiResponse<{ used: number; total: number; remaining: number }>>('/credits/usage')
}

/**
 * 回滚到指定部署版本
 */
export function rollback(deploymentId: string) {
  return post<ApiResponse<PublishResult>>('/deploy/rollback', { deploymentId })
}
