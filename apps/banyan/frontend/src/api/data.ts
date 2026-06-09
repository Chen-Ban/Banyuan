/**
 * Data API — 业务数据查询层
 *
 * 业务数据存储在本地 Preview Server 中（独立 MongoDB 实例）。
 * 所有请求直接打到 Preview Server 地址（从 PreviewServerCtx 获取）。
 *
 * 注意：不再走 banyan 后端（:3001），banyan 后端只负责元数据存储。
 */

// ── 类型定义 ──────────────────────────────────────────────────────────────────

export interface DataDocument {
  _id: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export interface DataListResponse {
  success: boolean
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

// ── Data API（直接请求 Preview Server） ───────────────────────────────────────

/**
 * 查询列表
 * @param baseUrl Preview Server 的地址（如 http://localhost:9100）
 * @param collectionName 集合名
 * @param options 分页/排序/过滤
 */
export async function listDocuments(
  baseUrl: string,
  collectionName: string,
  options: ListOptions = {},
): Promise<DataListResponse> {
  const params: Record<string, string> = {}
  if (options.limit !== undefined) params.limit = String(options.limit)
  if (options.skip !== undefined) params.skip = String(options.skip)
  if (options.sort) params.sort = JSON.stringify(options.sort)
  if (options.filter) Object.assign(params, options.filter)

  const qs = new URLSearchParams(params).toString()
  const url = `${baseUrl}/api/v1/data/${collectionName}${qs ? `?${qs}` : ''}`

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch data: ${res.status} ${res.statusText}`)
  }
  return res.json()
}

/**
 * 查询单条
 */
export async function getDocument(
  baseUrl: string,
  collectionName: string,
  id: string,
): Promise<{ success: boolean; data: DataDocument }> {
  const res = await fetch(`${baseUrl}/api/v1/data/${collectionName}/${id}`)
  if (!res.ok) {
    throw new Error(`Failed to fetch document: ${res.status} ${res.statusText}`)
  }
  return res.json()
}

/**
 * 创建文档
 */
export async function createDocument(
  baseUrl: string,
  collectionName: string,
  data: Record<string, unknown>,
): Promise<{ success: boolean; data: DataDocument }> {
  const res = await fetch(`${baseUrl}/api/v1/data/${collectionName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    throw new Error(`Failed to create document: ${res.status} ${res.statusText}`)
  }
  return res.json()
}

/**
 * 更新文档
 */
export async function updateDocument(
  baseUrl: string,
  collectionName: string,
  id: string,
  data: Record<string, unknown>,
): Promise<{ success: boolean; data: DataDocument }> {
  const res = await fetch(`${baseUrl}/api/v1/data/${collectionName}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    throw new Error(`Failed to update document: ${res.status} ${res.statusText}`)
  }
  return res.json()
}

/**
 * 删除文档
 */
export async function deleteDocument(
  baseUrl: string,
  collectionName: string,
  id: string,
): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${baseUrl}/api/v1/data/${collectionName}/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    throw new Error(`Failed to delete document: ${res.status} ${res.statusText}`)
  }
  return res.json()
}
