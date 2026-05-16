import { get, post } from './client'
import type { ApiResponse } from './client'

/**
 * 模板快照摘要（不含背景图，用于列表展示）
 */
export interface TemplateSnapshotSummary {
  snapshotId: string
  templateId: string
  templateName: string
  thumbnail?: string
  version: number
  paperWidth: number
  publishedAt: string
}

/**
 * 打印请求
 */
export interface PrintRequest {
  snapshotId: string
  orderId: string
}

/**
 * 获取本地已同步的模板快照列表（供店员选择）
 */
export function fetchSnapshots(): Promise<ApiResponse<TemplateSnapshotSummary[]>> {
  return get<ApiResponse<TemplateSnapshotSummary[]>>('/templates/snapshots')
}

/**
 * 手动触发从 Studio 拉取最新已发布模板
 */
export function syncTemplates(): Promise<ApiResponse<{ synced: number }>> {
  return post<ApiResponse<{ synced: number }>>('/templates/sync', {})
}

/**
 * 打印标签
 * @param snapshotId 模板快照 ID
 * @param orderId 订单 ID
 */
export function printLabel(snapshotId: string, orderId: string): Promise<ApiResponse<{ jobId: string }>> {
  return post<ApiResponse<{ jobId: string }>>('/print', { snapshotId, orderId })
}
