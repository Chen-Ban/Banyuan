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
  /** 完整 App 序列化 JSON（包含 lifetimes + scenes） */
  appJSON?: string
  tags?: string[]
  version?: number
  createdBy?: string
  updatedBy?: string
  createdAt: string
  updatedAt: string
}

/**
 * 应用表单数据（仅元信息）
 *
 * ADR-042：画布内容 appJSON 是版本化内容，不通过本表单/PUT /applications/:id 更新，
 * 必须走 appContentApi.saveAppContent → PUT /apps/:appId/app-content。
 * 故这里刻意不含 appJSON。
 */
export interface ApplicationFormData {
  name: string
  description?: string
  thumbnail?: string
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
 * 创建空白应用（服务端自动生成 ID、默认名称、空 appJSON）
 */
export function createApplication(): Promise<ApiResponse<Application>> {
  return post<ApiResponse<Application>>('/applications', {})
}

/**
 * 更新应用
 */
export function updateApplication(id: string, data: Partial<ApplicationFormData>): Promise<ApiResponse<Application>> {
  return put<ApiResponse<Application>>(`/applications/${id}`, data)
}

/**
 * 上传应用缩略图
 */
export function uploadThumbnail(id: string, blob: Blob): Promise<ApiResponse<{ thumbnail: string }>> {
  const formData = new FormData()
  formData.append('file', blob, 'thumbnail.png')
  return post<ApiResponse<{ thumbnail: string }>>(`/applications/${id}/thumbnail`, formData)
}

/**
 * 删除应用
 */
export function deleteApplication(id: string): Promise<ApiResponse<null>> {
  return del<ApiResponse<null>>(`/applications/${id}`)
}
