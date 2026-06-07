/**
 * 版本化内容类型定义（ADR-042）
 *
 * 三个 append-only 内容表的类型定义：
 *   - AppContent：存储 appJSON 版本
 *   - CollectionSchema：存储数据表定义版本（类型已在 collection.ts 中定义）
 *   - CloudFunction：存储云函数定义版本（本文件定义）
 *
 * 每个版本由一个 Dialogue 持有（反向引用 dialogueId），读取聚合时
 * 取最新 done Dialogue 的版本号精确定位，未接受（discarded）的版本被过滤。
 */

import type { Types } from 'mongoose'

// ─── AppContent（BanvasGL 序列化，append-only）──────────────────────────────────

/** AppContent 文档数据接口 */
export interface IAppContent {
  /** 关联 Application */
  appId: string
  /** 自增版本号 */
  version: number
  /** 持有该版本的 Dialogue ID（反向引用 / 审计） */
  dialogueId: Types.ObjectId
  /** BanvasGL Serializer 输出 */
  appJSON: string
  /** 创建时间（即该版本产生的时间） */
  createdAt: Date
}

// ─── CloudFunction（云函数定义组，append-only）────────────────────────────────────

/** 单个云函数定义（嵌入 CloudFunction.functions[] 中） */
export interface ICloudFunctionDef {
  /** 云函数唯一标识（UUID） */
  functionId: string
  /** 云函数名称（英文标识符） */
  name: string
  /** 显示名称 */
  displayName: string
  /** 描述 */
  description: string
  /** FlowSchema JSON */
  flowSchema: Record<string, unknown>
}

/** CloudFunction 版本化文档数据接口 */
export interface ICloudFunctionGroup {
  /** 关联 Application */
  appId: string
  /** 自增版本号 */
  version: number
  /** 持有该版本的 Dialogue ID（反向引用 / 审计） */
  dialogueId: Types.ObjectId
  /** 该版本下所有云函数定义 */
  functions: ICloudFunctionDef[]
  /** 创建时间 */
  createdAt: Date
}
