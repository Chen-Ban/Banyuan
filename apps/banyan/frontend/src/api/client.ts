/**
 * HTTP 客户端封装
 * 基于原生 fetch，统一处理错误和响应格式
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

/**
 * 统一请求方法（JSON 请求/响应）
 */
async function request<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const fullUrl = `${BASE_URL}${url}`

  const defaultHeaders: Record<string, string> = {}
  if (!(options.body instanceof FormData)) {
    defaultHeaders['Content-Type'] = 'application/json'
  }

  // 从 localStorage 读取 access token，附加到请求头
  const accessToken = localStorage.getItem(TOKEN_KEY)
  if (accessToken) {
    defaultHeaders['Authorization'] = `Bearer ${accessToken}`
  }

  const response = await fetch(fullUrl, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  })

  // 处理 401：清除本地 token
  if (response.status === 401) {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
    throw new ApiError('Unauthorized', 401)
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
 * 与 request() 相同的认证和 401 处理，但不解析 JSON，
 * 直接返回原始 Response 供调用方读取 ReadableStream。
 */
export async function stream(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const fullUrl = `${BASE_URL}${url}`

  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  const accessToken = localStorage.getItem(TOKEN_KEY)
  if (accessToken) {
    defaultHeaders['Authorization'] = `Bearer ${accessToken}`
  }

  const response = await fetch(fullUrl, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  })

  if (response.status === 401) {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
    throw new ApiError('Unauthorized', 401)
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
