/**
 * 应用全量状态聚合 API
 *
 * - saveAll：一次原子写入 appJSON + collections + cloudFunctions
 * - getFullState：聚合读取最新已接受版本的全部业务数据
 *
 * 对应后端路由：/api/apps/:appId/save-all 和 /api/apps/:appId/full-state
 */

import { get, put } from './client'
import type { ApiResponse } from './client'
import type { CollectionDef } from './schema'
import type { CloudFunctionDef } from './cloudFunctions'

export interface FullStateData {
  appJSON: string
  collections: CollectionDef[]
  cloudFunctions: CloudFunctionDef[]
}

export interface SaveAllParams {
  appJSON?: string
  collections?: CollectionDef[]
  cloudFunctions?: CloudFunctionDef[]
}

/**
 * 全量保存应用内容（一次 edit 对话原子写入）
 */
export function saveAll(appId: string, params: SaveAllParams): Promise<ApiResponse<{ appId: string }>> {
  return put<ApiResponse<{ appId: string }>>(`/apps/${appId}/save-all`, params)
}

/**
 * 读取应用完整业务数据（最新已接受版本）
 */
export function getFullState(appId: string): Promise<ApiResponse<FullStateData>> {
  return get<ApiResponse<FullStateData>>(`/apps/${appId}/full-state`)
}
