/**
 * 物料 API
 */

import { get, post, put, del } from './client'
import type { ApiResponse, PaginatedResponse } from './client'
import type { IMaterial } from '@banyuan/banvasgl'

/**
 * 物料列表查询参数
 */
export interface MaterialListParams {
  keyword?: string
  tags?: string[]
  source?: string
  status?: string
  page?: number
  pageSize?: number
}

/**
 * 物料列表分页响应
 */
interface MaterialListResponse {
  success: boolean
  data: {
    materials: Partial<IMaterial>[]
    total: number
    page: number
    pageSize: number
  }
}

/**
 * 创建物料请求体
 */
export interface CreateMaterialData {
  name: string
  description?: string
  tags?: string[]
  category?: string
  source?: string
  template: IMaterial['template']
}

/**
 * 获取物料列表
 */
export function fetchMaterials(params: MaterialListParams = {}): Promise<MaterialListResponse> {
  const { tags, ...rest } = params
  const query: Record<string, string | number | undefined> = {
    ...rest,
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 50,
  }
  if (tags && tags.length > 0) {
    query.tags = tags.join(',')
  }
  return get<MaterialListResponse>('/materials', query)
}

/**
 * 获取物料详情
 */
export function fetchMaterial(materialId: string): Promise<ApiResponse<IMaterial>> {
  return get<ApiResponse<IMaterial>>(`/materials/${materialId}`)
}

/**
 * 创建物料
 */
export function createMaterial(data: CreateMaterialData): Promise<ApiResponse<IMaterial>> {
  return post<ApiResponse<IMaterial>>('/materials', data)
}

/**
 * 更新物料
 */
export function updateMaterial(materialId: string, data: Partial<CreateMaterialData>): Promise<ApiResponse<IMaterial>> {
  return put<ApiResponse<IMaterial>>(`/materials/${materialId}`, data)
}

/**
 * 废弃物料
 */
export function deprecateMaterial(materialId: string): Promise<ApiResponse<IMaterial>> {
  return put<ApiResponse<IMaterial>>(`/materials/${materialId}`, { status: 'deprecated' })
}

/**
 * 删除物料（仅草稿）
 */
export function deleteMaterial(materialId: string): Promise<ApiResponse<null>> {
  return del<ApiResponse<null>>(`/materials/${materialId}`)
}

/**
 * 搜索物料
 */
export function searchMaterials(keyword: string, limit?: number): Promise<ApiResponse<Partial<IMaterial>[]>> {
  return get<ApiResponse<Partial<IMaterial>[]>>('/materials/search', { keyword, limit })
}
