import { get, post, put, del } from './client'
import type { ApiResponse } from './client'

// ── 类型定义 ──────────────────────────────────────────────────────────────────

export interface CloudFunctionDef {
  functionId: string
  name: string
  displayName: string
  description: string
  schema: { nodes: unknown[]; edges: unknown[] }
  version: number
  createdAt?: string
  updatedAt?: string
}

export interface CreateCloudFunctionParams {
  name: string
  displayName?: string
  description?: string
  schema?: { nodes: unknown[]; edges: unknown[] }
}

export interface UpdateCloudFunctionParams {
  name?: string
  displayName?: string
  description?: string
  schema?: { nodes: unknown[]; edges: unknown[] }
}

// ── API ───────────────────────────────────────────────────────────────────────

/** 获取应用的所有云函数 */
export function listFunctions(appId: string): Promise<ApiResponse<CloudFunctionDef[]>> {
  return get<ApiResponse<CloudFunctionDef[]>>(`/apps/${appId}/cloud-functions`)
}

/** 获取单个云函数详情 */
export function getFunction(appId: string, functionId: string): Promise<ApiResponse<CloudFunctionDef>> {
  return get<ApiResponse<CloudFunctionDef>>(`/apps/${appId}/cloud-functions/${functionId}`)
}

/** 创建云函数 */
export function createFunction(appId: string, params: CreateCloudFunctionParams): Promise<ApiResponse<CloudFunctionDef>> {
  return post<ApiResponse<CloudFunctionDef>>(`/apps/${appId}/cloud-functions`, params)
}

/** 更新云函数 */
export function updateFunction(
  appId: string,
  functionId: string,
  params: UpdateCloudFunctionParams,
): Promise<ApiResponse<CloudFunctionDef>> {
  return put<ApiResponse<CloudFunctionDef>>(`/apps/${appId}/cloud-functions/${functionId}`, params)
}

/** 删除云函数 */
export function deleteFunction(appId: string, functionId: string): Promise<ApiResponse<void>> {
  return del<ApiResponse<void>>(`/apps/${appId}/cloud-functions/${functionId}`)
}
