/**
 * 共享节点 —— 前后端均可使用
 */

import type { FlowValue, FlowCondition } from '../values.js'
import type { FlowSchema } from '../schema.js'

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

/**
 * 子流程节点 —— 可复用的节点集合抽象
 *
 * 将一段子图内联封装为单个节点，对外暴露输入/输出端口。
 * 画布上表现为可展开/折叠的容器节点。
 *
 * 与 callFlow 的区别：
 * - callFlow 引用外部 flowId（黑盒），subFlow 内嵌 FlowSchema（白盒）
 * - subFlow 可在画布内展开编辑，callFlow 需跳转到另一个编辑器
 * - subFlow 支持自定义端口数量（inputs/outputs 定义对外接口）
 */
export interface FlowSubFlowNode {
  kind: 'subFlow'
  /** 子流程名称（面板显示用） */
  name: string
  /** 内嵌子流程 schema */
  body: FlowSchema
  /** 对外暴露的输入端口定义 */
  inputs: Array<{ name: string; description?: string }>
  /** 对外暴露的输出端口定义 */
  outputs: Array<{ name: string; description?: string }>
}

/** 共享节点联合 */
export type SharedFlowNode =
  | FlowConditionNode
  | FlowDelayNode
  | FlowSetVariableNode
  | FlowCallFlowNode
  | FlowSubFlowNode
