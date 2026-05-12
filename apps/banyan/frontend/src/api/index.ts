/**
 * API 层统一导出
 */

export { ApiError } from './client'
export type { ApiResponse, PaginatedResponse } from './client'

export * as applicationApi from './applications'

export type { Application, ApplicationFormData } from './applications'
