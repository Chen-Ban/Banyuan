import { CompareOp, LogicOp } from './enums.js'

// ═══════════════════════════════════════════════════════════
// 基础原语 —— 数据引用 / 条件过滤 / 控制流出口
// ═══════════════════════════════════════════════════════════

/**
 * 下一节点 ID，空字符串 `""` 表示流程终点。
 *
 * v2.0.0 将原来的 `Next = Record<string, string>` 简化为纯 string：
 * - 单出口节点：直接写目标 nodeId
 * - 多出口节点（如 Condition）：每个 slot 有自己的 `next` 字段
 * - 终点节点（如 Return / navigate）：空字符串或 null
 */
export type Next = string

/**
 * 跨节点数据引用 —— 指向上游节点的某个输出字段。
 *
 * 运行时 `pull()` 遇到 DataRef 时递归调用 `stepNode` 求值上游节点，
 * 然后从上游 `outputs` 中取对应 `field` 的值。
 */
export interface DataRef {
  /** 上游节点 ID */
  nodeId: string
  /** 输出字段名（如 "value"、"rows"、"status"） */
  field: string
}

/**
 * 槽值：内联字面量 或 跨节点数据引用。
 *
 * 取值规则：先检查是否为 DataRef，是则 Pull 该引用，否则直接使用内联值。
 * DataRef 天然编码了"谁连到我"，不需要在顶层维护 DataEdge 数组。
 */
export type SlotValue = unknown | DataRef

/**
 * 判断槽值是否为 DataRef（类型守卫）。
 *
 * @param v - 待检测的值
 * @returns v 是否为 DataRef 实例
 */
export function isDataRef(v: unknown): v is DataRef {
  return typeof v === 'object' && v !== null && 'nodeId' in v && 'field' in v
}

/**
 * 比较条件：left op right。
 *
 * 两个操作数均为 SlotValue——可内联也可引用上游输出。
 */
export interface Condition {
  left: SlotValue
  op: CompareOp
  right: SlotValue
}

/**
 * 条件组合：逻辑运算符 + 子条件列表（含短路语义）。
 *
 * - And：从左到右逐一求值，首个 false 立即返回 false
 * - Or：首个 true 立即返回 true
 * - Not：对唯一条件取反
 */
export interface ConditionGroup {
  op: LogicOp
  conditions: (Condition | ConditionGroup)[]
}

/** Filter = Condition | ConditionGroup 的联合类型 */
export type Filter = Condition | ConditionGroup
