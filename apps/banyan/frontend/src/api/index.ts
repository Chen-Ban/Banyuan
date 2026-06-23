/**
 * API 层统一导出
 *
 * 三维度：
 *   - ui:          声明式 UI 定义（BanvasGL 序列化 JSON）
 *   - dataSchema:  数据表定义（Collection Schema）
 *   - cloudFunctions: 云函数定义（FlowSchema）
 */

export { ApiError } from './client'
export type { ApiResponse, PaginatedResponse } from './client'

export * as authApi from './auth'
export type { TokenPair, AuthUser } from './auth'
export * as applicationApi from './application/metadata'
export * as fullStateApi from './application/fullState'
export * as buildApi from './delivery/build'
export * as aiApi from './ai/stream'
export * as planningApi from './ai/planning'
export * as conversationApi from './ai/conversations'
export * as uiDefinitionApi from './ui/definition'
export * as dataSchemaApi from './dataSchema/collections'
/** @deprecated use dataSchemaApi instead */
export * as schemaApi from './dataSchema/collections'
export * as dataApi from './runtime/data'
export * as cloudFunctionApi from './cloudFunctions/index'
export * as materialApi from './materials/index'
export * as deployApi from './delivery/deploy'
export type { Application, ApplicationFormData } from './application/metadata'
export type { UIDefinitionData } from './ui/definition'
export type { Platform, BuildStatus, BuildTaskInfo, SubmitBuildParams, BuildTaskListResponse } from './delivery/build'
export type { AiStreamEvent, AiTextDeltaEvent, AiPhaseChangeEvent, AiAgentProgressEvent, AiToolActivityEvent, AiAuditProgressEvent, AiDoneEvent, AiErrorEvent, AiStartedEvent, ProviderInfo, ModelsResponse, PresignResponse, PendingDialogueInfo, ErrorPayload, ErrorCategory } from './ai/stream'
export type { AgentPromptConfig } from './ai/planning'
export type { FieldType, FieldDef, CollectionDef, DataSchemaDefinition } from './dataSchema/collections'
export type { DataDocument, DataListResponse, ListOptions } from './runtime/data'
export type { CloudFunctionDef, CreateCloudFunctionParams, UpdateCloudFunctionParams } from './cloudFunctions/index'
export type { ConversationMessage, Dialogue, DialogueType, Message, UserContent, AssistantContent, ImageItem } from './ai/conversations'
