/**
 * AppContent 模型（ADR-042）— BanvasGL 序列化内容的 append-only 版本化集合
 *
 * 对话创建时 append 一个新版本（拷贝最新已接受版本），agent / 用户原地修改。
 * 每个版本由一个 Dialogue 持有（dialogueId），读取聚合走最新 done Dialogue 的版本号。
 */

import mongoose, { Schema } from 'mongoose'
import type { IAppContent } from './types/versioned-content.js'

const AppContentSchema = new Schema<IAppContent>(
  {
    appId: { type: String, required: true, trim: true, index: true },
    version: { type: Number, required: true, min: 1, default: 1 },
    dialogueId: { type: Schema.Types.ObjectId, required: true, index: true },
    appJSON: { type: String, default: '' },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
)

// 联合唯一索引：同一 app 的版本号不可重复
AppContentSchema.index({ appId: 1, version: -1 }, { unique: true })

const AppContent = mongoose.model<IAppContent>('AppContent', AppContentSchema)

export default AppContent
