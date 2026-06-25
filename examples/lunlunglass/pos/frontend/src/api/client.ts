/**
 * HTTP 客户端封装
 * 基于原生 fetch，统一处理错误和响应格式
 */

const BASE_URL = '/api'

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
 * 统一请求方法
 */
async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const fullUrl = `${BASE_URL}${url}`

  const defaultHeaders: Record<string, string> = {}
  if (!(options.body instanceof FormData)) {
    defaultHeaders['Content-Type'] = 'application/json'
  }

  const response = await fetch(fullUrl, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  })

  const data = await response.json()

  if (!response.ok || !data.success) {
    throw new ApiError(data.message || `Request failed with status ${response.status}`, response.status)
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
