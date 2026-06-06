/**
 * AI Agent Prompt 配置模型（AgentPrompt）
 *
 * 存储应用级别的 AI Agent 角色提示词自定义配置（ADR-032）。
 * 每个应用可以为五个角色（master/pm/arch/visual/task）各自定义 system prompt。
 *
 * 如果未自定义（isCustomized=false 或文档不存在），则使用系统内置默认值。
 * 唯一约束：每个应用的每个角色最多一份配置。
 */

import mongoose, { Schema, type Document } from 'mongoose'
import type { IAgentPrompt } from './types/index.js'

export type { FullAgentRole, IAgentPrompt } from './types/index.js'

type IAgentPromptDoc = IAgentPrompt & Document

// ─── Schema 定义 ──────────────────────────────────────────────────────────────

const AgentPromptSchema = new Schema<IAgentPromptDoc>(
  {
    appId: {
      type: String,
      required: true,
      trim: true,
    },
    agent: {
      type: String,
      enum: ['master', 'pm', 'arch', 'visual', 'task'],
      required: true,
    },
    promptText: {
      type: String,
      required: true,
      default: '',
    },
    isCustomized: {
      type: Boolean,
      default: false,
    },
    systemVersion: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
  }
)

// ─── 索引 ─────────────────────────────────────────────────────────────────────

// 每个应用每个角色最多一份配置
AgentPromptSchema.index({ appId: 1, agent: 1 }, { unique: true })

// ─── 模型 ─────────────────────────────────────────────────────────────────────

const AgentPrompt = mongoose.model<IAgentPromptDoc>('AgentPrompt', AgentPromptSchema)

export default AgentPrompt
