import { get, post, put, del } from './client'
import type { ApiResponse } from './client'

// ── 类型定义 ──────────────────────────────────────────────────────────────────

export interface DataDocument {
  _id: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export interface DataListData {
  data: DataDocument[]
  pagination: {
    total: number
    limit: number
    skip: number
  }
}

export interface ListOptions {
  limit?: number
  skip?: number
  sort?: Record<string, 1 | -1>
  filter?: Record<string, string>
}

// ── Data API ──────────────────────────────────────────────────────────────────

/** 查询列表 */
export function listDocuments(
  appId: string,
  collectionName: string,
  options: ListOptions = {},
): Promise<ApiResponse<DataListData>> {
  const params: Record<string, string> = {}
  if (options.limit !== undefined) params.limit = String(options.limit)
  if (options.skip !== undefined) params.skip = String(options.skip)
  if (options.sort) params.sort = JSON.stringify(options.sort)
  if (options.filter) Object.assign(params, options.filter)

  const qs = new URLSearchParams(params).toString()
  const url = `/apps/${appId}/data/${collectionName}${qs ? `?${qs}` : ''}`
  return get<ApiResponse<DataListData>>(url)
}

/** 查询单条 */
export function getDocument(
  appId: string,
  collectionName: string,
  id: string,
): Promise<ApiResponse<DataDocument>> {
  return get<ApiResponse<DataDocument>>(`/apps/${appId}/data/${collectionName}/${id}`)
}

/** 创建文档 */
export function createDocument(
  appId: string,
  collectionName: string,
  data: Record<string, unknown>,
): Promise<ApiResponse<DataDocument>> {
  return post<ApiResponse<DataDocument>>(`/apps/${appId}/data/${collectionName}`, data)
}

/** 更新文档 */
export function updateDocument(
  appId: string,
  collectionName: string,
  id: string,
  data: Record<string, unknown>,
): Promise<ApiResponse<DataDocument>> {
  return put<ApiResponse<DataDocument>>(`/apps/${appId}/data/${collectionName}/${id}`, data)
}

/** 删除文档 */
export function deleteDocument(
  appId: string,
  collectionName: string,
  id: string,
): Promise<ApiResponse<{ message: string }>> {
  return del<ApiResponse<{ message: string }>>(`/apps/${appId}/data/${collectionName}/${id}`)
}
