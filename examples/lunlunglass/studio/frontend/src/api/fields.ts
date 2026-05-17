import { get } from './client'

/**
 * 字段渲染类型
 */
export type FieldType = 'text' | 'barcode' | 'qrcode'

/**
 * 单个字段契约
 */
export interface FieldDefinition {
  key: string
  label: string
  description: string
  dataPath: string
  type: FieldType
  example: string
}

/**
 * 字段分组
 */
export interface FieldGroup {
  groupKey: string
  groupLabel: string
  fields: FieldDefinition[]
}

interface FieldsResponse {
  success: boolean
  data: FieldGroup[]
}

/**
 * 获取字段注册表（Studio 后端代理转发到 POS）
 */
export function fetchFields(): Promise<FieldsResponse> {
  return get<FieldsResponse>('/fields')
}
