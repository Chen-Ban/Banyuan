/**
 * models/types barrel 文件
 *
 * 统一导出所有模型类型定义，作为 Service/Controller 层引用类型的唯一入口。
 * 模型文件（*.ts）只负责 Schema + Model 定义，不再承担接口定义职责。
 */

export type { FieldType, IFieldDef, ICollectionDef, ICollectionSchema } from './collection.js'

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
} from './dialogue.js'
export { PHASE_TRANSITIONS } from './dialogue.js'

export type { IConversation } from './conversation.js'

export type { IApplication } from './application.js'

export type { DeployStatus, IDeploySnapshot, IDeployment } from './deployment.js'

export type { UserStatus, IUser } from './user.js'

export type { MembershipRole, MembershipStatus, IMembership } from './membership.js'

export type { ITenant } from './tenant.js'

export type { EcsInstanceStatus, IEcsMetric, IEcsInstance } from './ecs-instance.js'

export type { IPlan, ICreditUsage, CreditUsageDetail } from './plan.js'

export type { EpisodeOutcome, IEpisode, FactCategory, IFact, IAgentMemory } from './agent-memory.js'

export type { FullAgentRole, IAgentPrompt } from './agent-prompt.js'

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
} from './material.js'

export type { PackagePlatform, PackageStatus, IPackageTask } from './package-task.js'

export type { IRefreshToken } from './refresh-token.js'

export type { IUIDefinition, ICloudFunctionDef, ICloudFunctionGroup } from './versioned-content.js'

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
} from './message-types.js'

export type { IPaymentOrder, PaymentChannel, PaymentStatus } from './payment.js'

export type { IBill, BillStatus } from './bill.js'

export type { INotification, NotificationType } from './notification.js'

export type { ILLMCallRecord } from './llm-call-record.js'
