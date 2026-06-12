/**
 * compute 节点 —— 纯变换（有输入、单输出、无副作用）
 *
 * 调度：Pull 求值。被 DataEdge 引用时递归 Pull 其输入后计算。
 * 输出端口统一为 "value"。
 */

import type { FlowSlot } from '../values.js'

/** 算术运算 */
export interface FlowMathNode {
  category: 'compute'
  kind: 'math'
  op: 'add' | 'sub' | 'mul' | 'div' | 'mod' | 'pow' | 'min' | 'max'
  a: FlowSlot
  b: FlowSlot
}

/** 比较运算 */
export interface FlowCompareNode {
  category: 'compute'
  kind: 'compare'
  op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  a: FlowSlot
  b: FlowSlot
}

/** 逻辑运算 */
export interface FlowLogicNode {
  category: 'compute'
  kind: 'logic'
  op: 'and' | 'or' | 'not'
  /** not 时长度为 1 */
  operands: FlowSlot[]
}

/** 字符串拼接 */
export interface FlowConcatNode {
  category: 'compute'
  kind: 'concat'
  parts: FlowSlot[]
  separator?: string
}

/** 字符串格式化 */
export interface FlowFormatNode {
  category: 'compute'
  kind: 'format'
  template: string
  values: Record<string, FlowSlot>
}

/** 字段/路径提取 */
export interface FlowGetNode {
  category: 'compute'
  kind: 'get'
  object: FlowSlot
  /** 提取路径，如 "count" / "rows.0.name" */
  path: string
}

/** compute 节点联合 */
export type FlowComputeNode =
  | FlowMathNode
  | FlowCompareNode
  | FlowLogicNode
  | FlowConcatNode
  | FlowFormatNode
  | FlowGetNode
