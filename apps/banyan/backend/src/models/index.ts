/**
 * models barrel 文件
 *
 * 导出所有 Mongoose Model 实例和类型。
 * 类型的权威来源为 models/types/，此处通过各模型文件的 re-export 转发。
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

// ─── Types（统一从 types/ 重导出）──────────────────────────────────────────────

export type { IApplication } from './types/index.js'
export type { IConversation } from './types/index.js'
export type {
  DialoguePhase,
  DialogueType,
  DiscardReason,
  ChangeTag,
  IDialogueSummary,
  IPlanningEntry,
  IInterruptMetadata,
  IMemoryUpdateInput,
  IDialogue,
} from './types/index.js'
export { PHASE_TRANSITIONS } from './types/index.js'
export type { IDialogueDoc } from './Dialogue.js'
export type { FullAgentRole, IAgentPrompt } from './types/index.js'
export type { PackagePlatform, PackageStatus, IPackageTask } from './types/index.js'
export type { FieldType, IFieldDef, ICollectionDef, ICollectionSchema } from './types/index.js'
export type { ICloudFunction } from './types/index.js'
export type { EpisodeOutcome, IEpisode, FactCategory, IFact, IAgentMemory } from './types/index.js'
export type {
  MaterialSource,
  MaterialStatus,
  MaterialKind,
  MaterialParameterType,
  IMaterialParameter,
  IMaterialAsset,
  IInternalIdRef,
  IMaterialTemplate,
  IMaterial,
} from './types/index.js'
export type { ProvisionStatus, ITenant } from './types/index.js'
export type { UserRole, UserStatus, IUser } from './types/index.js'
export type { IRefreshToken } from './types/index.js'
export type { DeployStatus, IDeploySnapshot, IDeployment } from './types/index.js'
export type {
  AssistantContentType,
  IImageItem,
  IUserContent,
  IAssistantContent,
  IMessage,
} from './types/index.js'
