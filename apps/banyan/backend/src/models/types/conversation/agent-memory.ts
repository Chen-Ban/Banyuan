/**
 * Agent 记忆类型定义
 *
 * 存储 AI Agent 在与用户交互过程中自主积累的经验（Episode）和事实（Fact）。
 * 设计参考：认知科学的情景记忆（Episodic）+ 语义记忆（Semantic）双轨模型。
 */

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
  /** 向量嵌入状态 */
  embeddingStatus: 'pending' | 'ready'
  /** 经验内容的向量嵌入（384 维，用于语义检索；仅 embeddingStatus=ready 时有值） */
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
  /** 向量嵌入状态 */
  embeddingStatus: 'pending' | 'ready'
  /** 事实内容的向量嵌入（384 维，用于语义检索；仅 embeddingStatus=ready 时有值） */
  embedding: number[] | null
  /** 创建时间 */
  createdAt: Date
  /** 该事实的最后更新时间（合并/增强/衰减时更新） */
  factUpdatedAt: Date
}

// ─── AgentMemory 文档数据接口 ─────────────────────────────────────────────────

export interface IAgentMemory {
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
