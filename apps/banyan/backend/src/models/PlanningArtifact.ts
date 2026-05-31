/**
 * 规划产物模型（PlanningArtifact）
 *
 * 记录 Multi-Agent 规划管线（ADR-032）的产出。
 * 四个 SubAgent 按序输出：PMAgent → ArchAgent → VisualAgent → TaskPlannerAgent
 * 每个 Agent 完成后通过 SSE planning_progress 事件通知后端持久化。
 *
 * 状态机：
 *   running → completed     （正常完成）
 *   running → interrupted   （用户打断 / AbortSignal）
 *   running → failed        （Agent 执行失败）
 *   interrupted → running   （continue / refine 恢复执行）
 *   interrupted → abandoned （restart 放弃当前）
 *
 * 与 Dialogue 的关系：
 *   仅 type='task' 的 Dialogue 关联 PlanningArtifact（通过 planningArtifactId 外键）。
 *   一个 Dialogue 最多关联一个 PlanningArtifact。
 */

import mongoose, { Schema, Document, Types } from 'mongoose'

// ─── 枚举类型 ─────────────────────────────────────────────────────────────────

/** Agent 角色 */
export type AgentRole = 'pm' | 'arch' | 'visual' | 'task'

/** 规划产物状态 */
export type PlanningArtifactStatus =
  | 'running'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'interrupted'
  | 'abandoned'

// ─── 产物条目（单个 Agent 的输出） ────────────────────────────────────────────

/** 单个 Agent 的产出条目 */
export interface IArtifactEntry {
  /** 所属 Agent */
  agent: AgentRole
  /** 结构化产出（Zod Schema 验证过的 JSON） */
  output: unknown
  /** Agent 推理过程摘要（前端展示用） */
  reasoning?: string
  /** Token 用量 */
  tokenUsage: { input: number; output: number }
  /** 耗时（ms） */
  durationMs: number
  /** 完成时间 */
  createdAt: Date
}

// ─── 中断快照（ADR-034） ──────────────────────────────────────────────────────

/** 部分状态（中断时正在执行的 Agent 的上下文） */
export interface IPartialAgentState {
  /** 正在执行的 Agent */
  agent: AgentRole
  /** 当前迭代轮次 */
  iteration: number
  /** 已产生的消息（供恢复时注入） */
  messages?: unknown[]
}

/** 中断快照 */
export interface IPlanningSnapshot {
  /** 中断发生时正在执行的节点 */
  interruptedAt: AgentRole | 'execute'
  /** 已完成的产物 checkpoint ID 列表 */
  completedAgents: AgentRole[]
  /** 中断时正在执行的 Agent 的部分状态 */
  partialState?: IPartialAgentState
  /** 中断时间 */
  interruptedAt_ts: Date
}

// ─── PlanningArtifact 文档接口 ────────────────────────────────────────────────

export interface IPlanningArtifact extends Document {
  /** 关联的应用 ID */
  appId: string
  /** 关联的 Dialogue._id */
  dialogueId: Types.ObjectId

  /** PMAgent 产出 */
  featureList?: IArtifactEntry
  /** ArchAgent 产出 */
  techPlan?: IArtifactEntry
  /** VisualAgent 产出 */
  visualSpec?: IArtifactEntry
  /** TaskPlannerAgent 产出 */
  changeSpec?: IArtifactEntry

  /** 规划状态 */
  status: PlanningArtifactStatus
  /** 若失败，记录失败的 Agent */
  failedAt?: AgentRole
  /** 规划开始时间 */
  startedAt: Date
  /** 规划完成时间 */
  completedAt?: Date

  /** 中断快照（ADR-034） */
  snapshot?: IPlanningSnapshot
}

// ─── Schema 定义 ──────────────────────────────────────────────────────────────

const ArtifactEntrySchema = new Schema<IArtifactEntry>(
  {
    agent: {
      type: String,
      enum: ['pm', 'arch', 'visual', 'task'],
      required: true,
    },
    output: {
      type: Schema.Types.Mixed,
      required: true,
    },
    reasoning: {
      type: String,
      default: undefined,
    },
    tokenUsage: {
      type: new Schema(
        {
          input: { type: Number, required: true },
          output: { type: Number, required: true },
        },
        { _id: false }
      ),
      required: true,
    },
    durationMs: {
      type: Number,
      required: true,
    },
    createdAt: {
      type: Date,
      default: () => new Date(),
    },
  },
  { _id: false }
)

const PartialAgentStateSchema = new Schema<IPartialAgentState>(
  {
    agent: {
      type: String,
      enum: ['pm', 'arch', 'visual', 'task'],
      required: true,
    },
    iteration: {
      type: Number,
      required: true,
    },
    messages: {
      type: [Schema.Types.Mixed],
      default: undefined,
    },
  },
  { _id: false }
)

const PlanningSnapshotSchema = new Schema<IPlanningSnapshot>(
  {
    interruptedAt: {
      type: String,
      enum: ['pm', 'arch', 'visual', 'task', 'execute'],
      required: true,
    },
    completedAgents: {
      type: [String],
      default: [],
    },
    partialState: {
      type: PartialAgentStateSchema,
      default: undefined,
    },
    interruptedAt_ts: {
      type: Date,
      default: () => new Date(),
    },
  },
  { _id: false }
)

const PlanningArtifactSchema = new Schema<IPlanningArtifact>(
  {
    appId: {
      type: String,
      required: true,
      trim: true,
    },
    dialogueId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    featureList: {
      type: ArtifactEntrySchema,
      default: undefined,
    },
    techPlan: {
      type: ArtifactEntrySchema,
      default: undefined,
    },
    visualSpec: {
      type: ArtifactEntrySchema,
      default: undefined,
    },
    changeSpec: {
      type: ArtifactEntrySchema,
      default: undefined,
    },
    status: {
      type: String,
      enum: ['running', 'completed', 'partial', 'failed', 'interrupted', 'abandoned'],
      required: true,
      default: 'running',
    },
    failedAt: {
      type: String,
      enum: ['pm', 'arch', 'visual', 'task'],
      default: undefined,
    },
    startedAt: {
      type: Date,
      default: () => new Date(),
    },
    completedAt: {
      type: Date,
      default: undefined,
    },
    snapshot: {
      type: PlanningSnapshotSchema,
      default: undefined,
    },
  },
  {
    timestamps: false,
  }
)

// ─── 索引 ─────────────────────────────────────────────────────────────────────

// 按应用查询规划历史
PlanningArtifactSchema.index({ appId: 1, startedAt: -1 })

// 通过 dialogueId 关联（一个 task 对话最多一个 artifact）
PlanningArtifactSchema.index({ dialogueId: 1 }, { unique: true })

// 查找最近完成的产物（用于 previousArtifact 注入）
PlanningArtifactSchema.index({ appId: 1, status: 1, completedAt: -1 })

// ─── 模型 ─────────────────────────────────────────────────────────────────────

const PlanningArtifact = mongoose.model<IPlanningArtifact>('PlanningArtifact', PlanningArtifactSchema)

export default PlanningArtifact
