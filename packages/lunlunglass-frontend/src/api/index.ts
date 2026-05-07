/**
 * API 层统一导出
 */

export { ApiError } from './client'
export type { ApiResponse, PaginatedResponse } from './client'

export * as userApi from './users'
export * as orderApi from './orders'
export * as productApi from './products'
export * as templateApi from './templates'

export type { Template, TemplateFormData } from './templates'
