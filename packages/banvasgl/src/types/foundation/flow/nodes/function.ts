import { NodeCategory, NodeKind } from '../enums.js'
import type { FlowLocalFunctionSlot } from '../slots.js'

/**
 * Function（函数）节点
 *
 * Function 节点创建新作用域边界（ContextFrame），隔离 vars，
 * state 和 cap 继承父帧，执行完毕后返回结果。
 */
export interface FlowLocalFunctionNode {
  id: string
  category: NodeCategory.Function
  kind: NodeKind.LocalFunction
  slots: FlowLocalFunctionSlot[]
}

export type FlowFunctionNode = FlowLocalFunctionNode
