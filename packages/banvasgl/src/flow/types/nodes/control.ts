/**
 * control 节点 —— 选路（无副作用）
 *
 * 调度：Push 执行。决定控制流走向（匹配 branch 选出边、或下钻内嵌子图）。
 */

import type { FlowSlot } from '../values.js'
import type { FlowSubSchema } from '../schema.js'

/** 条件分支节点 */
export interface FlowConditionNode {
  category: 'control'
  kind: 'condition'
  /** 判据 case 列表。每项的 slot 由 DataEdge 注入 boolean。按序求值，首个 true 命中 */
  cases: { slot: FlowSlot; label: string }[]
  /** 默认分支 label（所有 case 均 false 时走） */
  default?: string
  onError?: FlowSubSchema
}

/** 条件循环节点 */
export interface FlowWhileNode {
  category: 'control'
  kind: 'while'
  /** 循环条件判据插槽（DataEdge 注入 boolean） */
  condition: FlowSlot
  /** 循环体子图（可调用闭包） */
  body: FlowSubSchema
  onError?: FlowSubSchema
}

/** 集合遍历节点 */
export interface FlowForEachNode {
  category: 'control'
  kind: 'forEach'
  /** 要遍历的集合 */
  collection: FlowSlot
  /** 迭代变量名，默认 "item" */
  itemVar?: string
  /** 索引变量名，默认 "index" */
  indexVar?: string
  /** 循环体子图（可调用闭包） */
  body: FlowSubSchema
  onError?: FlowSubSchema
}

/** 并行执行节点 */
export interface FlowParallelNode {
  category: 'control'
  kind: 'parallel'
  /** 并发分支 */
  branches: FlowSubSchema[]
  /** 汇聚模式（对应 Promise 静态方法） */
  mode: 'all' | 'allSettled' | 'race' | 'any'
  onError?: FlowSubSchema
  // 输出端口: "result"（由 mode 决定产出协议）
}

/** 可复用子流程节点 */
export interface FlowSubFlowNode {
  category: 'control'
  kind: 'subFlow'
  /** 被引用的子流程 ID */
  subFlowId: string
  /** 形参绑定 */
  inputs: Record<string, FlowSlot>
  onError?: FlowSubSchema
  // 输出端口: 由被调子图连入 subExit 的 DataEdge.fromPort 定义
}

/** control 节点联合 */
export type FlowControlNode =
  | FlowConditionNode
  | FlowWhileNode
  | FlowForEachNode
  | FlowParallelNode
  | FlowSubFlowNode
