/**
 * API 层统一导出
 */

export { ApiError } from './client'
export type { ApiResponse, PaginatedResponse } from './client'

export * as templateApi from './templates'

export type { Template, TemplateFormData } from './templates'
