import { get, put } from '../client'
import type { ApiResponse } from '../client'

/**
 * 画布内容（appJSON）API
 *
 * ADR-042：appJSON 是版本化内容（AppContent 内容表），不再写入 Application 文档。
 * 画布手动保存走独立端点 /apps/:appId/app-content，后端包装为一个自动验收的
 * type='edit' 对话（runAutoConfirmedEdit），把序列化后的 appJSON 落库为新版本。
 */

export interface AppContentData {
  appId: string
  appJSON: string
  version: number
}

/**
 * 读取最新已接受版本的画布 appJSON
 */
export function fetchAppContent(appId: string): Promise<ApiResponse<AppContentData>> {
  return get<ApiResponse<AppContentData>>(`/apps/${appId}/app-content`)
}

/**
 * 保存画布 appJSON（自动验收的 edit 对话，整体覆盖写入）
 */
export function saveAppContent(appId: string, appJSON: string): Promise<ApiResponse<{ appId: string }>> {
  return put<ApiResponse<{ appId: string }>>(`/apps/${appId}/app-content`, { appJSON })
}
