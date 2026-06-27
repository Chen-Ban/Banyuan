/**
 * UIDefinition 类型定义（ADR-042）
 *
 * 存储 BanvasGL UI 定义 JSON 的 append-only 版本化文档。
 * 每个版本由一个 Dialogue 持有（dialogueId），读取聚合时取最新 done Dialogue 的版本号。
 */

import type { Types } from 'mongoose'

/** UIDefinition 文档数据接口 */
export interface IUiDefinition {
  /** 关联 Application */
  appId: string
  /** 自增版本号 */
  version: number
  /** 持有该版本的 Dialogue ID（反向引用 / 审计） */
  dialogueId: Types.ObjectId
  /** BanvasGL Serializer 输出的 UI 定义 JSON */
  uiJSON: string
  /** 创建时间（即该版本产生的时间） */
  createdAt: Date
}
