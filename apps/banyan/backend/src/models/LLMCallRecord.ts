/**
 * LLMCallRecord Mongoose 模型 — AI 调用分析记录
 *
 * 追踪每次 AI 调用的 token/credit 投入，区分「productive」（已确认）与「wasted」（已废弃）。
 * 在 AiService.onDone 中创建（isCommitted = false），在 _confirmDialogueCore 中更新为 true。
 */

import mongoose, { Schema, Document } from 'mongoose'
import type { ILLMCallRecord } from './types/index.js'

type ILLMCallRecordDoc = ILLMCallRecord & Document

const LLMCallRecordSchema = new Schema<ILLMCallRecordDoc>(
  {
    recordId: { type: String, required: true, unique: true, index: true },
    tenantId: { type: String, required: true, index: true },
    appId: { type: String, required: true, index: true },
    dialogueId: { type: String, required: true, index: true },
    agentName: { type: String, required: true },
    llmModel: { type: String, required: true },
    provider: { type: String, required: true },
    inputTokens: { type: Number, required: true },
    outputTokens: { type: Number, required: true },
    credits: { type: Number, required: true },
    dialoguePhase: { type: String, required: true },
    isCommitted: { type: Boolean, required: true, default: false },
    timestamp: { type: Date, required: true, default: Date.now },
  },
  { timestamps: false, collection: 'llm_call_records' },
)

LLMCallRecordSchema.index({ tenantId: 1, timestamp: -1 })
LLMCallRecordSchema.index({ dialogueId: 1 })

export const LLMCallRecord = mongoose.model<ILLMCallRecordDoc>('LLMCallRecord', LLMCallRecordSchema)
