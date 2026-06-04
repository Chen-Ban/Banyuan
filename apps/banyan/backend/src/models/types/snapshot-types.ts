/**
 * 快照共享类型（Snapshot Shared Types）
 *
 * 这些接口描述应用快照的数据结构，被多个模型共享引用：
 *   - Dialogue（独立集合，ADR-039 后的权威载体）
 *   - Deployment（部署记录的发布快照）
 *   - Snapshot（旧模型，Phase 4 退役前仍保留）
 *
 * 从 Snapshot.ts 中提取为独立共享类型，断开 Deployment 对 Snapshot 模型的直接依赖。
 */

// ─── 数据库表字段快照 ─────────────────────────────────────────────────────────

export interface IFieldSnapshot {
  name: string
  displayName: string
  type: string
  required: boolean
  defaultValue?: unknown
  refCollection?: string
  enumValues?: string[]
}

// ─── 数据库表快照 ─────────────────────────────────────────────────────────────

export interface ICollectionSnapshot {
  /** 集合名称（英文标识符） */
  name: string
  /** 显示名称 */
  displayName: string
  /** 字段定义数组 */
  fields: IFieldSnapshot[]
}

// ─── 云函数快照 ───────────────────────────────────────────────────────────────

export interface ICloudFunctionSnapshot {
  /** 云函数唯一标识 */
  functionId: string
  /** 云函数名称（英文标识符） */
  name: string
  /** 显示名称（中文） */
  displayName: string
  /** FlowSchema JSON（节点图） */
  flowSchema: unknown
}
