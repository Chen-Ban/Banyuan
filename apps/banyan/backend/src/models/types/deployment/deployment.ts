/**
 * 部署（Deployment）类型定义
 */

import type { ICollectionDef } from '../application/collection.js'
import type { ICloudFunctionDef } from '../application/cloud-function.js'

// ─── 部署状态 ─────────────────────────────────────────────────────────────────

export type DeployStatus =
  | 'pending' // 等待 agent 接收
  | 'building' // 构建中（scaffold + install + vite build）
  | 'deploying' // 部署中（配置 nginx / 启动容器）
  | 'success' // 部署成功
  | 'failed' // 部署失败

// ─── 发布快照 ──────────────────────────────────────────────────────────────────

/** 每次 publish 时将发送给 agent 的完整数据冻结在此，支持回滚时原样重发 */
export interface IDeploySnapshot {
  /** 完整的 UI 定义 JSON（序列化字符串） */
  uiJSON: string
  /** 数据库表定义（fullstack 模式下） */
  collections: ICollectionDef[]
  /** 云函数定义（fullstack 模式下） */
  cloudFunctions: ICloudFunctionDef[]
}

// ─── 部署记录 ──────────────────────────────────────────────────────────────────

export interface IDeployment {
  /** 部署记录 ID */
  deploymentId: string
  /** 关联的应用 ID */
  applicationId: string
  /** 团队 ID */
  teamId: string
  /** 部署的应用版本号 */
  version: number
  /** 部署类型 */
  deployType: 'static' | 'fullstack'
  /** 部署状态 */
  status: DeployStatus
  /** 当前步骤描述 */
  currentStep?: string
  /** 进度百分比 0-100 */
  progress: number
  /** 部署成功后的访问 URL */
  url?: string
  /** 错误信息 */
  error?: string
  /** 触发人 */
  triggeredBy: string
  /** 发布数据快照（完整嵌入，支持回滚） */
  snapshot?: IDeploySnapshot
  /** 部署开始时间 */
  startedAt?: Date
  /** 部署完成时间 */
  finishedAt?: Date
  createdAt: Date
  updatedAt: Date
}
