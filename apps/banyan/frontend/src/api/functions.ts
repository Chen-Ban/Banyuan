import { get, put, del, post } from './client'
import type { ApiResponse } from './client'

// ── 类型定义 ──────────────────────────────────────────────────────────────────

export interface AppFunction {
  name: string
  code: string
  description: string
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  createdAt?: string
  updatedAt?: string
}

export interface ValidateResult {
  valid: boolean
  error?: string
}

export interface RunResult {
  result: unknown
  logs: string[]
}

// ── Functions API ─────────────────────────────────────────────────────────────

/** 获取应用的所有云函数 */
export function listFunctions(appId: string): Promise<ApiResponse<AppFunction[]>> {
  return get<ApiResponse<AppFunction[]>>(`/apps/${appId}/functions`)
}

/** 获取单个云函数详情 */
export function getFunction(appId: string, name: string): Promise<ApiResponse<AppFunction>> {
  return get<ApiResponse<AppFunction>>(`/apps/${appId}/functions/${encodeURIComponent(name)}`)
}

/** 新增或更新云函数 */
export function upsertFunction(
  appId: string,
  name: string,
  data: Omit<AppFunction, 'name' | 'createdAt' | 'updatedAt'>,
): Promise<ApiResponse<AppFunction>> {
  return put<ApiResponse<AppFunction>>(`/apps/${appId}/functions/${encodeURIComponent(name)}`, data)
}

/** 删除云函数 */
export function deleteFunction(appId: string, name: string): Promise<ApiResponse<void>> {
  return del<ApiResponse<void>>(`/apps/${appId}/functions/${encodeURIComponent(name)}`)
}

/** 校验云函数代码 */
export function validateCode(
  appId: string,
  name: string,
  code: string,
): Promise<ApiResponse<ValidateResult>> {
  return post<ApiResponse<ValidateResult>>(
    `/apps/${appId}/functions/${encodeURIComponent(name)}/validate`,
    { code },
  )
}

/** 执行云函数 */
export function runFunction(
  appId: string,
  name: string,
  input: unknown,
): Promise<ApiResponse<RunResult>> {
  return post<ApiResponse<RunResult>>(
    `/apps/${appId}/functions/${encodeURIComponent(name)}/run`,
    { input },
  )
}
