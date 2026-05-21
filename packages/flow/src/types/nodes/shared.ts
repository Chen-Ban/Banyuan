/**
 * 共享节点 —— 前后端均可使用
 */

import type { FlowValue, FlowCondition } from '../values.js'

/** 条件分支节点 */
export interface FlowConditionNode {
  kind: 'condition'
  condition: FlowCondition
}

/** 延迟等待节点 */
export interface FlowDelayNode {
  kind: 'delay'
  ms: number
}

/** 设置变量节点（通用） */
export interface FlowSetVariableNode {
  kind: 'setVariable'
  scope: string // 变量 scope（前端: viewId/'self'/'page'，后端: 'local'/'flow'）
  key: string
  value: FlowValue
}

/** 调用另一个 FlowSchema（跨环境/本地） */
export interface FlowCallFlowNode {
  kind: 'callFlow'
  flowId: string // 目标 FlowSchema 的 ID
  inputBindings: Record<string, FlowValue> // 入参映射
  outputBindings: Record<string, string> // 出参 → 写入本地哪个变量 key
}

/** 共享节点联合 */
export type SharedFlowNode =
  | FlowConditionNode
  | FlowDelayNode
  | FlowSetVariableNode
  | FlowCallFlowNode
