/**
 * 应用（Application）类型定义
 */

export interface IApplication {
  /** 应用业务ID */
  application_id: string
  /** 应用名称 */
  name: string
  /** 应用描述 */
  description: string
  /** 缩略图 URL */
  thumbnail: string
  /** 完整 App 序列化 JSON（BanvasGL Serializer 输出，包含 lifetimes + scenes） */
  appJSON: string
  /** 标签 */
  tags: string[]
  /** 版本号（每次保存自增） */
  version: number
  /** 租户 ID */
  tenantId: string
  /** 创建者 */
  createdBy: string
  /** 最后修改者 */
  updatedBy: string

  // ─── Web 发布相关 ─────────────────────────────────────────────────────────
  /** 应用 URL slug（用于子域名路由，如 my-app → my-app.tenant.banyuan.club） */
  appSlug?: string
  /** 已发布的版本号（null 表示从未发布） */
  publishedVersion?: number
  /** Web 访问 URL（发布后填充） */
  webUrl?: string
  /** 最近一次部署时间 */
  lastDeployedAt?: Date
  /** 部署类型 */
  deployType?: 'static' | 'fullstack'

  /** 创建时间 */
  createdAt: Date
  /** 更新时间 */
  updatedAt: Date
}
