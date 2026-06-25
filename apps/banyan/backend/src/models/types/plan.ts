/**
 * Plan / CreditUsage 类型定义
 */

/** 套餐定义（种子数据，运行时热更新） */
export interface IPlan {
  planId: string
  name: string
  /** 月 credit 额度（0 表示无限制） */
  monthlyCredits: number
  /** 价格（分，0 表示免费） */
  priceInCents: number
  /** 套餐包含的权限列表 */
  permissions: string[]
  /** 是否激活 */
  active: boolean
  createdAt: Date
  updatedAt: Date
}

/** 月度 credit 用量记录 */
export interface ICreditUsage {
  usageId: string
  tenantId: string
  /** 计费周期标识：'2026-06' 格式 */
  yearMonth: string
  /** 已消耗 credits */
  creditsUsed: number
  /** 详情快照（模型维度） */
  detail: CreditUsageDetail[]
  createdAt: Date
  updatedAt: Date
}

export interface CreditUsageDetail {
  /** 会话 ID */
  sessionId: string
  /** 使用的模型名称 */
  model: string
  /** 输入 token 数 */
  inputTokens: number
  /** 输出 token 数 */
  outputTokens: number
  /** 消耗 credits */
  credits: number
  /** 发生时间 */
  timestamp: Date
}

/** 套餐内置权限名称 */
export const PERMISSIONS = {
  APP_CREATE: 'app:create',
  APP_EDIT: 'app:edit',
  AI_CHAT: 'ai:chat',
  DEPLOY_PUBLISH: 'deploy:publish',
  SCHEMA_MANAGE: 'schema:manage',
  DATA_BROWSE: 'data:browse',
  MATERIAL_USE: 'material:use',
} as const
