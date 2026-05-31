/**
 * HTTP 客户端封装
 * 基于原生 fetch，统一处理错误和响应格式
 *
 * Token 刷新策略：
 * - 请求收到 401 时，自动使用 refresh token 获取新的 access token
 * - 刷新成功后重试原请求（对调用方透明）
 * - 刷新失败（refresh token 也过期）时才清除登录态
 * - 并发请求共享同一个刷新 Promise，避免重复刷新
 */

const BASE_URL = '/api'

const TOKEN_KEY = 'banyan_access_token'
const REFRESH_TOKEN_KEY = 'banyan_refresh_token'

/**
 * API 响应格式
 */
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  message?: string
}

/**
 * 分页响应格式
 */
export interface PaginatedResponse<T> {
  success: boolean
  data: {
    total: number
    page: number
    pageSize: number
  } & T
}

/**
 * API 错误类
 */
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// ─── Token 刷新基础设施 ────────────────────────────────────────────────────────

/** 正在进行中的刷新 Promise（用于并发请求去重） */
let refreshingPromise: Promise<boolean> | null = null

/**
 * 尝试用 refresh token 获取新的 token 对。
 * 返回 true 表示刷新成功（localStorage 已更新），false 表示刷新失败。
 * 并发调用会共享同一个 Promise。
 */
function tryRefreshToken(): Promise<boolean> {
  if (refreshingPromise) return refreshingPromise

  refreshingPromise = (async () => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)
    if (!refreshToken) return false

    try {
      const response = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })

      if (!response.ok) return false

      const result = await response.json()
      if (!result.success || !result.data) return false

      // 写入新 token 对
      localStorage.setItem(TOKEN_KEY, result.data.accessToken)
      localStorage.setItem(REFRESH_TOKEN_KEY, result.data.refreshToken)
      return true
    } catch {
      return false
    }
  })().finally(() => {
    refreshingPromise = null
  })

  return refreshingPromise
}

/**
 * 清除本地登录态
 */
function clearTokens() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}

// ─── 请求方法 ──────────────────────────────────────────────────────────────────

/**
 * 构建请求 headers（含 Authorization）
 */
function buildHeaders(options: RequestInit): Record<string, string> {
  const headers: Record<string, string> = {}
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  const accessToken = localStorage.getItem(TOKEN_KEY)
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }
  return headers
}

/**
 * 统一请求方法（JSON 请求/响应）
 * 遇到 401 自动刷新 token 并重试一次
 */
async function request<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const fullUrl = `${BASE_URL}${url}`

  const doFetch = async () => {
    const headers = buildHeaders(options)
    return fetch(fullUrl, {
      ...options,
      headers: { ...headers, ...(options.headers as Record<string, string> | undefined) },
    })
  }

  let response = await doFetch()

  // 401 → 尝试刷新 token 后重试
  if (response.status === 401) {
    const refreshed = await tryRefreshToken()
    if (refreshed) {
      response = await doFetch()
    }
    // 刷新失败或重试后仍然 401 → 清除登录态
    if (response.status === 401) {
      clearTokens()
      throw new ApiError('Unauthorized', 401)
    }
  }

  const data = await response.json()

  if (!response.ok || !data.success) {
    throw new ApiError(
      data.message || `Request failed with status ${response.status}`,
      response.status
    )
  }

  return data as T
}

/**
 * GET 请求
 */
export function get<T>(url: string, params?: Record<string, string | number | undefined>): Promise<T> {
  let queryString = ''
  if (params) {
    const filtered = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    if (filtered.length > 0) {
      queryString = '?' + filtered.join('&')
    }
  }
  return request<T>(`${url}${queryString}`)
}

/**
 * POST 请求
 */
export function post<T>(url: string, body?: unknown): Promise<T> {
  return request<T>(url, {
    method: 'POST',
    body: body instanceof FormData ? body : JSON.stringify(body),
  })
}

/**
 * PUT 请求
 */
export function put<T>(url: string, body?: unknown): Promise<T> {
  return request<T>(url, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

/**
 * DELETE 请求
 */
export function del<T>(url: string): Promise<T> {
  return request<T>(url, { method: 'DELETE' })
}

/**
 * 流式请求（SSE 等场景）
 *
 * 与 request() 相同的认证和 401 刷新处理，但不解析 JSON，
 * 直接返回原始 Response 供调用方读取 ReadableStream。
 */
export async function stream(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const fullUrl = `${BASE_URL}${url}`

  const doFetch = async () => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    const accessToken = localStorage.getItem(TOKEN_KEY)
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`
    }
    return fetch(fullUrl, {
      ...options,
      headers: { ...headers, ...(options.headers as Record<string, string> | undefined) },
    })
  }

  let response = await doFetch()

  // 401 → 尝试刷新 token 后重试
  if (response.status === 401) {
    const refreshed = await tryRefreshToken()
    if (refreshed) {
      response = await doFetch()
    }
    if (response.status === 401) {
      clearTokens()
      throw new ApiError('Unauthorized', 401)
    }
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new ApiError(
      text || `Request failed with status ${response.status}`,
      response.status
    )
  }

  return response
}
