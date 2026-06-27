/**
 * 团队（Team）类型定义
 *
 * Team 是计费和资源分配的最小单位（团队/组织级别）。
 * ECS 开通信息已迁至独立的 EcsInstance 模型。
 * 用户与团队的关联关系由 Membership 模型承载（N:N）。
 */

export interface ITeam {
  teamId: string
  name: string
  plan: 'free' | 'pro'

  /** 当前生效的套餐 ID （引用 Plan.planId） */
  planId?: string

  /** 订阅到期时间（付费套餐有效期） */
  subscriptionExpiresAt?: Date

  createdAt: Date
  updatedAt: Date
}
