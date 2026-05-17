import { get, post, put, del } from './client'
import type { ApiResponse } from './client'

/**
 * 动态字段文本样式
 */
export interface IPrintFieldTextStyle {
  fontSize: number
  fontWeight: 'normal' | 'bold'
  align: 'left' | 'center' | 'right'
  overflow: 'clip' | 'ellipsis' | 'shrink'
}

/**
 * 打印模板动态字段描述
 */
export interface IPrintField {
  key: string
  label: string
  type: 'text' | 'barcode' | 'qrcode'
  bounds: { x: number; y: number; width: number; height: number }
  textStyle?: IPrintFieldTextStyle
  defaultValue?: string
}

/**
 * 模板信息
 */
export interface Template {
  id: string
  name: string
  description?: string
  thumbnail?: string
  pages?: string[]
  tags?: string[]
  version?: number
  publishStatus?: 'draft' | 'published'
  latestSnapshotId?: string | null
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
  pages?: string[]
  tags?: string[]
}

/**
 * 发布模板请求数据
 */
export interface PublishTemplateData {
  /** exportImage() 导出的 Base64 背景图 */
  backgroundImage: string
  /** 背景图像素尺寸 */
  backgroundSize: { width: number; height: number }
  /** 动态字段列表（绑定了 fieldKey 的 TextView） */
  fields: IPrintField[]
  /** 缩略图（可选，与 backgroundImage 相同） */
  thumbnail?: string
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

/**
 * 发布模板（生成快照，供 POS 拉取）
 */
export function publishTemplate(
  id: string,
  data: PublishTemplateData
): Promise<ApiResponse<{ snapshotId: string }>> {
  return post<ApiResponse<{ snapshotId: string }>>(`/templates/${id}/publish`, data)
}
