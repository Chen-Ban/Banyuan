/**
 * models barrel 文件
 *
 * 导出所有 Mongoose Model 实例和嵌入用 Schemas。
 * 类型定义统一从 models/types/ 导入，此文件不做类型转发。
 */

// ─── Models ────────────────────────────────────────────────────────────────────

export { default as Application } from './Application.js'
export { default as Conversation } from './Conversation.js'
export { default as Dialogue } from './Dialogue.js'
export { default as AgentPrompt } from './AgentPrompt.js'
export { default as PackageTaskModel } from './PackageTask.js'
export { default as CollectionSchemaModel } from './CollectionSchema.js'
export { default as CloudFunction } from './CloudFunction.js'
export { default as AgentMemory } from './AgentMemory.js'
export { default as Material } from './Material.js'
export { Tenant } from './Tenant.js'
export { User } from './User.js'
export { RefreshToken } from './RefreshToken.js'
export { Deployment } from './Deployment.js'

// ─── Schemas（供嵌入复用）───────────────────────────────────────────────────────

export { FieldDefSchema, CollectionDefSchema } from './CollectionSchema.js'
export { CloudFunctionEmbedSchema } from './CloudFunction.js'

// ─── Doc 类型（Model 层定义的 Document 交叉类型）──────────────────────────────────

export type { IDialogueDoc } from './Dialogue.js'
export type { IConversationDoc } from './Conversation.js'
export type { IUserDoc } from './User.js'
export type { IAgentMemoryDoc } from './AgentMemory.js'
