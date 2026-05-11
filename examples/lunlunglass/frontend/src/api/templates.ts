import { get, post, put, del } from './client'
import type { ApiResponse } from './client'

/**
 * 模板信息
 */
export interface Template {
  id: string
  name: string
  description?: string
  thumbnail?: string
  scenes?: string[]
  tags?: string[]
  version?: number
  createdBy?: string
  updatedBy?: string
  createdAt: string
  updatedAt: string
}

/**
 * 模板表单数据
 */
export interface TemplateFormData {
  name: string
  description?: string
  thumbnail?: string
  scenes?: string[]
  tags?: string[]
}

interface TemplateListResponse {
  success: boolean
  data: {
    templates: Template[]
    total: number
    page: number
    pageSize: number
  }
}

/**
 * 获取模板列表
 */
export function fetchTemplates(
  page: number = 1,
  pageSize: number = 20,
  keyword?: string
): Promise<TemplateListResponse> {
  return get<TemplateListResponse>('/templates', {
    page,
    pageSize,
    name: keyword,
  })
}

/**
 * 获取模板详情
 */
export function fetchTemplate(id: string): Promise<ApiResponse<Template>> {
  return get<ApiResponse<Template>>(`/templates/${id}`)
}

/**
 * 创建模板
 */
export function createTemplate(data: TemplateFormData & { id: string }): Promise<ApiResponse<Template>> {
  return post<ApiResponse<Template>>('/templates', data)
}

/**
 * 更新模板
 */
export function updateTemplate(id: string, data: Partial<TemplateFormData>): Promise<ApiResponse<Template>> {
  return put<ApiResponse<Template>>(`/templates/${id}`, data)
}

/**
 * 删除模板
 */
export function deleteTemplate(id: string): Promise<ApiResponse<null>> {
  return del<ApiResponse<null>>(`/templates/${id}`)
}
