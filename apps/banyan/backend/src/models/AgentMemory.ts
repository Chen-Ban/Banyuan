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

import mongoose, { Schema, type Document } from 'mongoose'
import type { IEpisode, IFact, IAgentMemory } from './types/index.js'

export type IAgentMemoryDoc = IAgentMemory & Document

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

const AgentMemorySchema = new Schema<IAgentMemoryDoc>(
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

const AgentMemory = mongoose.model<IAgentMemoryDoc>('AgentMemory', AgentMemorySchema)

export default AgentMemory
