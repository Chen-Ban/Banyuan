/**
 * models barrel 文件
 *
 * 按领域分层导出所有 Mongoose Model 实例和嵌入用 Schemas。
 * 类型定义统一从 models/types/ 导入，此文件不做类型转发。
 */

// ─── auth ────────────────────────────────────────────────────────────────────

export { User } from './auth/User.js'
export { Team } from './auth/Team.js'
export { Membership } from './auth/Membership.js'
export { RefreshToken } from './auth/RefreshToken.js'

// ─── application ─────────────────────────────────────────────────────────────

export { default as Application } from './application/Application.js'
export { default as UIDefinition } from './application/UIDefinition.js'
export { default as CollectionSchemaModel } from './application/CollectionSchema.js'
export { default as CloudFunction } from './application/CloudFunction.js'

// ─── conversation ────────────────────────────────────────────────────────────

export { default as Conversation } from './conversation/Conversation.js'
export { default as Dialogue } from './conversation/Dialogue.js'
export { default as AgentMemory } from './conversation/AgentMemory.js'
export { default as AgentPrompt } from './conversation/AgentPrompt.js'
// ─── deployment ──────────────────────────────────────────────────────────────

export { Deployment } from './deployment/Deployment.js'
export { default as PackageTaskModel } from './deployment/PackageTask.js'

// ─── ecs ─────────────────────────────────────────────────────────────────────

export { EcsInstance } from './ecs/EcsInstance.js'

// ─── billing ─────────────────────────────────────────────────────────────────

export { Plan } from './billing/Plan.js'
export { CreditUsage } from './billing/CreditUsage.js'
export { Bill } from './billing/Bill.js'
export { PaymentOrder } from './billing/PaymentOrder.js'
export { Notification } from './billing/Notification.js'

// ─── material ────────────────────────────────────────────────────────────────

export { default as Material } from './material/Material.js'

// ─── Schemas（供嵌入复用）───────────────────────────────────────────────────────

export { FieldDefSchema, CollectionDefSchema } from './application/CollectionSchema.js'
export { CloudFunctionDefSchema } from './application/CloudFunction.js'

// ─── Doc 类型（Model 层定义的 Document 交叉类型）──────────────────────────────────

export type { IDialogueDoc } from './conversation/Dialogue.js'
export type { IConversationDoc } from './conversation/Conversation.js'
export type { IUserDoc } from './auth/User.js'
export type { IMembershipDoc } from './auth/Membership.js'
export type { IAgentMemoryDoc } from './conversation/AgentMemory.js'
