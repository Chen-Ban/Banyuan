/**
 * 数据集合类型定义
 *
 * 定义应用的数据库表结构（字段类型、集合定义），
 * 被 Dialogue、Deployment、CollectionSchema 模型共享引用。
 */

import type { Types } from 'mongoose'

// ── 字段类型枚举 ──────────────────────────────────────────────────────────────

export type FieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'enum'
  | 'ref'
  | 'array'
  | 'object'

// ── 字段定义 ──────────────────────────────────────────────────────────────────

export interface IFieldDef {
  name: string
  displayName: string
  type: FieldType
  required: boolean
  defaultValue?: unknown
  /** type === 'ref' 时，关联的 Collection 名称 */
  refCollection?: string
  /** type === 'enum' 时的可选值列表 */
  enumValues?: string[]
}

// ── Collection 定义 ───────────────────────────────────────────────────────────

export interface ICollectionDef {
  name: string
  displayName: string
  fields: IFieldDef[]
}

// ── CollectionSchema 文档数据接口 ──────────────────────────────────────────────

export interface ICollectionSchema {
  appId: string
  collections: ICollectionDef[]
  version: number
  /** 持有该版本的 Dialogue ID（反向引用 / 审计） */
  dialogueId: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}
