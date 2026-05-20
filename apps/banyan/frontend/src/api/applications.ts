import { get, post, put, del } from './client'
import type { ApiResponse } from './client'

/**
 * 应用信息
 */
export interface Application {
  application_id: string
  name: string
  description?: string
  thumbnail?: string
  pages?: string[]
  tags?: string[]
  version?: number
  createdBy?: string
  updatedBy?: string
  createdAt: string
  updatedAt: string
}

/**
 * 应用表单数据
 */
export interface ApplicationFormData {
  name: string
  description?: string
  thumbnail?: string
  pages?: string[]
  tags?: string[]
}

interface ApplicationListResponse {
  success: boolean
  data: {
    applications: Application[]
    total: number
    page: number
    pageSize: number
  }
}

/**
 * 获取应用列表
 */
export function fetchApplications(
  page: number = 1,
  pageSize: number = 20,
  keyword?: string
): Promise<ApplicationListResponse> {
  return get<ApplicationListResponse>('/applications', {
    page,
    pageSize,
    name: keyword,
  })
}

/**
 * 获取应用详情
 */
export function fetchApplication(id: string): Promise<ApiResponse<Application>> {
  return get<ApiResponse<Application>>(`/applications/${id}`)
}

/**
 * 创建应用
 */
export function createApplication(data: ApplicationFormData & { application_id: string }): Promise<ApiResponse<Application>> {
  return post<ApiResponse<Application>>('/applications', data)
}

/**
 * 更新应用
 */
export function updateApplication(id: string, data: Partial<ApplicationFormData>): Promise<ApiResponse<Application>> {
  return put<ApiResponse<Application>>(`/applications/${id}`, data)
}

/**
 * 删除应用
 */
export function deleteApplication(id: string): Promise<ApiResponse<null>> {
  return del<ApiResponse<null>>(`/applications/${id}`)
}
