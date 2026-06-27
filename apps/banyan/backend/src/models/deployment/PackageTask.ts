import mongoose, { Schema, type Document } from 'mongoose'
import type { IPackageTask } from '../types/index.js'

/**
 * 构建任务 Mongoose 模型
 *
 * 将构建任务状态持久化到 MongoDB，解决进程重启后任务状态丢失的问题。
 * 前端轮询 /build/:taskId 时，即使进程重启也能从 DB 恢复任务状态。
 */
type IPackageTaskDoc = IPackageTask & Document

const PackageTaskSchema = new Schema<IPackageTaskDoc>(
  {
    taskId: { type: String, required: true, unique: true, index: true },
    appName: { type: String, required: true },
    platform: { type: String, required: true, enum: ['mac', 'win', 'linux'] },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'running', 'success', 'failed'],
      default: 'pending',
    },
    outputFile: { type: String },
    error: { type: String },
  },
  {
    timestamps: true,
    // 30 天后自动过期（TTL 索引），避免历史任务无限堆积
    // 注意：TTL 索引基于 updatedAt，任务完成后不再更新，30 天后自动清理
  },
)

// 30 天 TTL：基于 updatedAt，任务完成后 30 天自动清理
PackageTaskSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 })

export default mongoose.model<IPackageTaskDoc>('PackageTask', PackageTaskSchema)
