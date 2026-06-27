/**
 * UIDefinition 模型（ADR-042）— BanvasGL UI 定义 JSON 的 append-only 版本化集合
 *
 * 对话创建时 append 一个新版本（拷贝最新已接受版本），agent / 用户原地修改。
 * 每个版本由一个 Dialogue 持有（dialogueId），读取聚合走最新 done Dialogue 的版本号。
 */

import mongoose, { Schema } from 'mongoose'
import type { IUIDefinition } from '../types/application/versioned-content.js'

const UIDefinitionSchema = new Schema<IUIDefinition>(
  {
    appId: { type: String, required: true, trim: true, index: true },
    version: { type: Number, required: true, min: 1, default: 1 },
    dialogueId: { type: Schema.Types.ObjectId, required: true, index: true },
    uiJSON: { type: String, default: '' },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
)

// 联合唯一索引：同一 app 的版本号不可重复
UIDefinitionSchema.index({ appId: 1, version: -1 }, { unique: true })

const UIDefinition = mongoose.model<IUIDefinition>('UIDefinition', UIDefinitionSchema)

export default UIDefinition
