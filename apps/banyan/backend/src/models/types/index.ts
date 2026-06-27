/**
 * models/types barrel 文件
 *
 * 按领域分层 re-export 所有模型类型定义。
 * 对外暴露统一入口，内部按领域子目录组织。
 */

// ─── auth ────────────────────────────────────────────────────────────────────

export type { UserStatus, IUser } from './auth/user.js'
export type { ITeam } from './auth/team.js'
export type { MembershipRole, MembershipStatus, IMembership } from './auth/membership.js'
export type { IRefreshToken } from './auth/refresh-token.js'

// ─── application ─────────────────────────────────────────────────────────────

export type { IApplication } from './application/application.js'
export type { FieldType, IFieldDef, ICollectionDef, ICollectionSchema } from './application/collection.js'
export type { IUiDefinition } from './application/uid-definition.js'
export type { ICloudFunctionDef, ICloudFunction } from './application/cloud-function.js'

// ─── conversation ────────────────────────────────────────────────────────────

export type { IConversation } from './conversation/conversation.js'

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
} from './conversation/dialogue.js'
export { PHASE_TRANSITIONS } from './conversation/dialogue.js'

export type { EpisodeOutcome, IEpisode, FactCategory, IFact, IAgentMemory } from './conversation/agent-memory.js'

export type { FullAgentRole, IAgentPrompt } from './conversation/agent-prompt.js'

export type {
  AssistantContentType,
  IImageItem,
  IUserContent,
  IAssistantContentBase,
  ITextContent,
  IToolCallContent,
  IToolResultContent,
  IAppSnapshotContent,
  ISchemaUpdateContent,
  IDisambiguationContent,
  IPlanningProgressContent,
  IErrorContent,
  IAssistantContent,
  IMessage,
} from './conversation/message.js'

// ─── deployment ──────────────────────────────────────────────────────────────

export type { DeployStatus, IDeploySnapshot, IDeployment } from './deployment/deployment.js'
export type { PackagePlatform, PackageStatus, IPackageTask } from './deployment/package-task.js'

// ─── ecs ─────────────────────────────────────────────────────────────────────

export type { EcsInstanceStatus, IEcsMetric, IEcsInstance } from './ecs/ecs-instance.js'

// ─── billing ─────────────────────────────────────────────────────────────────

export type { IPlan, ICreditUsage, CreditUsageDetail } from './billing/plan.js'
export type { IPaymentOrder, PaymentChannel, PaymentStatus } from './billing/payment.js'
export type { IBill, BillStatus } from './billing/bill.js'
export type { INotification, NotificationType } from './billing/notification.js'

// ─── material ────────────────────────────────────────────────────────────────

export type {
  MaterialSource,
  MaterialKind,
  TemplateParameterType,
  ITemplateParameter,
  ITemplateAsset,
  ITemplate,
  IInternalIdRef,
  IMaterialMeta,
  IMaterial,
  IMaterialDocument,
} from './material/material.js'
