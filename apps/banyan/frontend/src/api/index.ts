/**
 * API 层统一导出
 */

export { ApiError } from './client'
export type { ApiResponse, PaginatedResponse } from './client'

export * as authApi from './auth'
export type { TokenPair, AuthUser } from './auth'
export * as applicationApi from './application/metadata'
export * as appContentApi from './application/content'
export * as buildApi from './delivery/build'
export * as aiApi from './ai/stream'
export * as planningApi from './ai/planning'
export * as conversationApi from './ai/conversations'
export * as schemaApi from './backend/schema'
export * as dataApi from './runtime/data'
export * as cloudFunctionApi from './backend/cloudFunctions'
export * as materialApi from './backend/materials'
export * as deployApi from './delivery/deploy'
export type { Application, ApplicationFormData } from './application/metadata'
export type { AppContentData } from './application/content'
export type { Platform, BuildStatus, BuildTaskInfo, SubmitBuildParams, BuildTaskListResponse } from './delivery/build'
export type { AiStreamEvent, AiTextDeltaEvent, AiPhaseChangeEvent, AiAgentProgressEvent, AiToolActivityEvent, AiAuditProgressEvent, AiDoneEvent, AiErrorEvent, AiStartedEvent, ProviderInfo, ModelsResponse, PresignResponse, PendingDialogueInfo, ErrorPayload, ErrorCategory } from './ai/stream'
export type { AgentPromptConfig } from './ai/planning'
export type { FieldType, FieldDef, CollectionDef, AppSchema } from './backend/schema'
export type { DataDocument, DataListResponse, ListOptions } from './runtime/data'
export type { CloudFunctionDef, CreateCloudFunctionParams, UpdateCloudFunctionParams } from './backend/cloudFunctions'
export type { ConversationMessage, Dialogue, DialogueType, Message, UserContent, AssistantContent, ImageItem } from './ai/conversations'
