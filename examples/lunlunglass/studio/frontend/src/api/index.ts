/**
 * API 层统一导出
 */

export { ApiError } from './client'
export type { ApiResponse, PaginatedResponse } from './client'

export * as templateApi from './templates'
export * as fieldsApi from './fields'

export type {
  Template,
  TemplateFormData,
  IPrintField,
  IPrintFieldTextStyle,
  PrintSampleData,
} from './templates'
export type { FieldDefinition, FieldGroup, FieldType } from './fields'
