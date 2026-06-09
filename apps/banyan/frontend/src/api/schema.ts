import { get, post, put, del } from './client'
import type { ApiResponse } from './client'

// ── 类型定义 ──────────────────────────────────────────────────────────────────

export type FieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'enum'
  | 'ref'
  | 'array'
  | 'object'

export interface FieldDef {
  name: string
  displayName: string
  type: FieldType
  required: boolean
  defaultValue?: unknown
  refCollection?: string
  enumValues?: string[]
}

export interface CollectionDef {
  name: string
  displayName: string
  fields: FieldDef[]
}

export interface AppSchema {
  appId: string
  collections: CollectionDef[]
  version: number
  createdAt?: string
  updatedAt?: string
}

// ── Schema API ────────────────────────────────────────────────────────────────

/** 获取应用的完整 Schema */
export function fetchSchema(appId: string): Promise<ApiResponse<AppSchema>> {
  return get<ApiResponse<AppSchema>>(`/apps/${appId}/schema`)
}

/** 新增 Collection */
export function addCollection(
  appId: string,
  collection: Pick<CollectionDef, 'name' | 'displayName'> & { fields?: FieldDef[] },
): Promise<ApiResponse<CollectionDef>> {
  return post<ApiResponse<CollectionDef>>(`/apps/${appId}/schema/collections`, collection)
}

/** 更新 Collection（displayName 或 fields 整体替换） */
export function updateCollection(
  appId: string,
  collectionName: string,
  updates: Partial<Pick<CollectionDef, 'displayName' | 'fields'>>,
): Promise<ApiResponse<CollectionDef>> {
  return put<ApiResponse<CollectionDef>>(`/apps/${appId}/schema/collections/${collectionName}`, updates)
}

/** 删除 Collection */
export function deleteCollection(
  appId: string,
  collectionName: string,
): Promise<ApiResponse<AppSchema>> {
  return del<ApiResponse<AppSchema>>(`/apps/${appId}/schema/collections/${collectionName}`)
}

/** 新增字段 */
export function addField(
  appId: string,
  collectionName: string,
  field: FieldDef,
): Promise<ApiResponse<AppSchema>> {
  return post<ApiResponse<AppSchema>>(
    `/apps/${appId}/schema/collections/${collectionName}/fields`,
    field,
  )
}

/** 更新字段 */
export function updateField(
  appId: string,
  collectionName: string,
  fieldName: string,
  updates: Partial<FieldDef>,
): Promise<ApiResponse<AppSchema>> {
  return put<ApiResponse<AppSchema>>(
    `/apps/${appId}/schema/collections/${collectionName}/fields/${fieldName}`,
    updates,
  )
}

/** 删除字段 */
export function deleteField(
  appId: string,
  collectionName: string,
  fieldName: string,
): Promise<ApiResponse<AppSchema>> {
  return del<ApiResponse<AppSchema>>(
    `/apps/${appId}/schema/collections/${collectionName}/fields/${fieldName}`,
  )
}
