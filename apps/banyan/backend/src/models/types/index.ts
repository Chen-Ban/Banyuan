/**
 * models/types barrel 文件
 *
 * 统一导出所有模型类型定义，作为 Service/Controller 层引用类型的唯一入口。
 * 模型文件（*.ts）只负责 Schema + Model 定义，不再承担接口定义职责。
 */

export type { ICloudFunction } from './cloud-function.js'

export type {
  FieldType,
  IFieldDef,
  ICollectionDef,
  ICollectionSchema,
} from './collection.js'

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

export type {
  DeployStatus,
  IDeploySnapshot,
  IDeployment,
} from './deployment.js'

export type { UserRole, UserStatus, IUser } from './user.js'

export type { ProvisionStatus, ITenant } from './tenant.js'

export type {
  EpisodeOutcome,
  IEpisode,
  FactCategory,
  IFact,
  IAgentMemory,
} from './agent-memory.js'

export type { FullAgentRole, IAgentPrompt } from './agent-prompt.js'

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
} from './material.js'

export type { PackagePlatform, PackageStatus, IPackageTask } from './package-task.js'

export type { IRefreshToken } from './refresh-token.js'

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
