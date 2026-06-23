import { get, put } from '../client'
import type { ApiResponse } from '../client'

/**
 * UI 定义 API — BanvasGL 序列化的 UI 定义 JSON 的读写
 *
 * ADR-042：uiJSON 是版本化内容（UIDefinition 内容表），不再写入 Application 文档。
 * 画布手动保存走独立端点 /apps/:appId/app-content，后端包装为一个自动验收的
 * type='edit' 对话（runAutoConfirmedEdit），把序列化后的 uiJSON 落库为新版本。
 */

export interface UIDefinitionData {
  appId: string
  uiJSON: string
  version: number
}

/**
 * 读取最新已接受版本的 UI 定义 JSON
 */
export function fetchUIDefinition(appId: string): Promise<ApiResponse<UIDefinitionData>> {
  return get<ApiResponse<UIDefinitionData>>(`/apps/${appId}/app-content`)
}

/**
 * 保存 UI 定义 JSON（自动验收的 edit 对话，整体覆盖写入）
 */
export function saveUIDefinition(appId: string, uiJSON: string): Promise<ApiResponse<{ appId: string }>> {
  return put<ApiResponse<{ appId: string }>>(`/apps/${appId}/app-content`, { uiJSON })
}
