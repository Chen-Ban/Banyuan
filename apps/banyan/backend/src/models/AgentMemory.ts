/**
 * Agent 记忆模型
 *
 * 存储 AI Agent 在与用户交互过程中自主积累的经验（Episode）和事实（Fact）。
 * 一个 Application 对应一个 AgentMemory（1:1 关系），以 appId 为唯一索引。
 *
 * 与 Conversation 模型的区别：
 *   - Conversation 存"对话历史"——用户说了什么、AI 回了什么（只追加）
 *   - AgentMemory 存"认知积累"——Agent 从中学到了什么（会增强/衰减/淘汰）
 *
 * 记忆生命周期：
 *   - Episode（中期经验）：随时间衰减，定期合并压缩，上限 200 条
 *   - Fact（长期事实）：被验证时增强、被反驳时减弱，归零则删除，上限 500 条
 *
 * 数据流：
 *   写入：XiangDi extractMemoryNode → SSE memory_update 事件 → MemoryService.handleMemoryUpdate()
 *   读取：ContextBuilder 构建上下文时 → MemoryService.recall() → 语义检索 + 评分排序
 *
 * 设计参考：认知科学的情景记忆（Episodic）+ 语义记忆（Semantic）双轨模型
 */

import mongoose, { Schema, Document } from 'mongoose'

// ─── Episode（中期经验记忆）─────────────────────────────────────────────────────

/** 经验执行结果 */
export type EpisodeOutcome = 'success' | 'failure' | 'partial' | 'aborted'

/**
 * 单条经验记录。
 *
 * 记录一次有价值的任务执行经验，包括做了什么、结果如何、学到了什么。
 * 评分公式：score = relevance × 0.5 + recency × 0.2 + importance × 0.3
 */
export interface IEpisode {
  /** 经验唯一 ID */
  episodeId: string
  /** 一句话标题（如"为眼镜店 POS 添加库存表格"） */
  title: string
  /** 完整经验描述（2-3 句话，来自 LLM 总结） */
  content: string
  /** 执行结果 */
  outcome: EpisodeOutcome
  /** 从中学到的教训（1-3 条） */
  lessons: string[]
  /** 涉及的实体名（View 名称、组件名等） */
  involvedEntities: string[]
  /** 分类标签（table / layout / style / data-binding 等） */
  tags: string[]
  /** 重要性评分 0-1（由 LLM 评估） */
  importance: number
  /** 经验内容的向量嵌入（384 维，用于语义检索） */
  embedding: number[] | null
  /** 创建时间 */
  createdAt: Date
  /** 上次被 recall 命中的时间（用于计算时间衰减） */
  lastAccessedAt: Date
}

// ─── Fact（长期事实记忆）──────────────────────────────────────────────────────────

/** 事实分类 */
export type FactCategory =
  | 'user_preference'
  | 'design_pattern'
  | 'coding_convention'
  | 'project_knowledge'
  | 'tool_usage'
  | 'error_pattern'
  | 'general'

/**
 * 单条事实记录。
 *
 * 存储从执行经验中提炼出的稳定结论，具有跨任务复用价值。
 * 评分公式：score = relevance × 0.6 + confidence × 0.3 + min(refCount/10, 0.3) × 0.1
 */
export interface IFact {
  /** 事实唯一 ID */
  factId: string
  /** 事实分类 */
  category: FactCategory
  /** 事实内容（如"该项目图表统一使用蓝色系配色"） */
  content: string
  /** 置信度 0-1（被验证时增强，被反驳时减弱） */
  confidence: number
  /** 被 recall 命中的次数（引用计数） */
  referenceCount: number
  /** 来源 episodeId 列表（可追溯） */
  derivedFrom: string[]
  /** 事实内容的向量嵌入（384 维，用于语义检索） */
  embedding: number[] | null
  /** 创建时间 */
  createdAt: Date
  /** 最后更新时间（合并/增强/衰减时更新） */
  updatedAt: Date
}

// ─── AgentMemory 文档接口 ─────────────────────────────────────────────────────

export interface IAgentMemory extends Document {
  /** 关联的应用 ID（唯一索引，1 App = 1 AgentMemory） */
  appId: string
  /** 经验记录列表（上限 200 条，超限自动压缩） */
  episodes: IEpisode[]
  /** 事实记录列表（上限 500 条，超限淘汰低价值条目） */
  facts: IFact[]
  /** 上次维护时间（consolidate + decay） */
  lastMaintainedAt: Date
  /** 创建时间 */
  createdAt: Date
  /** 最后更新时间 */
  updatedAt: Date
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const EpisodeSchema = new Schema<IEpisode>(
  {
    episodeId: { type: String, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    content: { type: String, required: true, maxlength: 2000 },
    outcome: {
      type: String,
      enum: ['success', 'failure', 'partial', 'aborted'],
      required: true,
    },
    lessons: { type: [String], default: [] },
    involvedEntities: { type: [String], default: [] },
    tags: { type: [String], default: [] },
    importance: { type: Number, required: true, min: 0, max: 1 },
    embedding: { type: [Number], default: null },
    createdAt: { type: Date, default: () => new Date() },
    lastAccessedAt: { type: Date, default: () => new Date() },
  },
  { _id: false }
)

const FactSchema = new Schema<IFact>(
  {
    factId: { type: String, required: true },
    category: {
      type: String,
      enum: [
        'user_preference',
        'design_pattern',
        'coding_convention',
        'project_knowledge',
        'tool_usage',
        'error_pattern',
        'general',
      ],
      required: true,
    },
    content: { type: String, required: true, maxlength: 1000 },
    confidence: { type: Number, required: true, min: 0, max: 1 },
    referenceCount: { type: Number, default: 0, min: 0 },
    derivedFrom: { type: [String], default: [] },
    embedding: { type: [Number], default: null },
    createdAt: { type: Date, default: () => new Date() },
    updatedAt: { type: Date, default: () => new Date() },
  },
  { _id: false }
)

const AgentMemorySchema = new Schema<IAgentMemory>(
  {
    appId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    episodes: {
      type: [EpisodeSchema],
      default: [],
    },
    facts: {
      type: [FactSchema],
      default: [],
    },
    lastMaintainedAt: {
      type: Date,
      default: () => new Date(),
    },
  },
  {
    timestamps: true,
  }
)

// ─── 模型 ─────────────────────────────────────────────────────────────────────

const AgentMemory = mongoose.model<IAgentMemory>('AgentMemory', AgentMemorySchema)

export default AgentMemory
