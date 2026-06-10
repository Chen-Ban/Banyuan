/**
 * 物料 API
 *
 * 三端统一使用基础库 @banyuan/banvasgl 的 IMaterial（meta + template 嵌套结构）。
 * 后端在 IMaterial 之上附加 kind / applicationId 两个持久化维度。
 */

import { get, post, put, del } from '../client'
import type { ApiResponse } from '../client'
import type { IMaterial } from '@banyuan/banvasgl'

/** 物料种类（物料面板的三个分类维度） */
export type MaterialKind = 'render' | 'client-flow' | 'server-flow'

/** 物料文档 = 基础库 IMaterial + 后端持久化维度 */
export interface MaterialDocument extends IMaterial {
  kind: MaterialKind
  applicationId?: string
}

/**
 * 物料列表查询参数
 */
export interface MaterialListParams {
  keyword?: string
  tags?: string[]
  /** 物料种类（render / client-flow / server-flow） */
  kind?: MaterialKind
  source?: string
  applicationId?: string
  page?: number
  pageSize?: number
}

/**
 * 物料列表分页响应
 */
interface MaterialListResponse {
  success: boolean
  data: {
    materials: Partial<MaterialDocument>[]
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
  kind?: MaterialKind
  source?: string
  applicationId: string
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
export function fetchMaterial(materialId: string): Promise<ApiResponse<MaterialDocument>> {
  return get<ApiResponse<MaterialDocument>>(`/materials/${materialId}`)
}

/**
 * 创建物料
 */
export function createMaterial(data: CreateMaterialData): Promise<ApiResponse<MaterialDocument>> {
  return post<ApiResponse<MaterialDocument>>('/materials', data)
}

/**
 * 更新物料
 */
export function updateMaterial(
  materialId: string,
  data: Partial<CreateMaterialData>,
): Promise<ApiResponse<MaterialDocument>> {
  return put<ApiResponse<MaterialDocument>>(`/materials/${materialId}`, data)
}

/**
 * 删除物料（硬删除）
 */
export function deleteMaterial(materialId: string, applicationId?: string): Promise<ApiResponse<null>> {
  const url = applicationId
    ? `/materials/${materialId}?applicationId=${encodeURIComponent(applicationId)}`
    : `/materials/${materialId}`
  return del<ApiResponse<null>>(url)
}

/**
 * 搜索物料
 */
export function searchMaterials(keyword: string, limit?: number): Promise<ApiResponse<Partial<MaterialDocument>[]>> {
  return get<ApiResponse<Partial<MaterialDocument>[]>>('/materials/search', { keyword, limit })
}
