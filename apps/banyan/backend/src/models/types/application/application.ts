/**
 * 应用（Application）类型定义
 *
 * ADR-042：Application 是纯元数据壳。
 * UIDefinition JSON / collectionSchema / cloudFunctions 已拆分到独立的 append-only 内容表。
 * 读取内容时通过 appId 查内容表最新版本，不需要版本指针。
 */

export interface IApplication {
  /** 应用业务ID */
  application_id: string
  /** 应用名称 */
  name: string
  /** 缩略图 URL */
  thumbnail: string
  /** 标签 */
  tags: string[]
  /** 版本号（每次保存自增） */
  version: number
  /** 团队 ID */
  teamId: string
  /** 创建者 */
  createdBy: string
  /** 最后修改者 */
  updatedBy: string

  /** 应用可见性：private=仅创建者可见，team=同团队成员可见 */
  visibility: 'private' | 'team'

  // ─── Web 发布相关 ─────────────────────────────────────────────────────────
  /** 应用 URL slug（用于子域名路由，如 my-app → my-app.team.banyuan.club） */
  appSlug?: string
  /** 已发布的版本号（null 表示从未发布） */
  publishedVersion?: number
  /** Web 访问 URL（发布后填充） */
  webUrl?: string
  /** 最近一次部署时间 */
  lastDeployedAt?: Date
  /** 部署类型 */
  deployType?: 'static' | 'fullstack'

  /** 应用级 AI 额度上限（不设置则回落团队额度） */
  aiLimit?: number

  /** 创建时间 */
  createdAt: Date
  /** 更新时间 */
  updatedAt: Date
}
