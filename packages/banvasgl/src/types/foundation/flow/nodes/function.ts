import { NodeCategory, NodeKind } from '../enums.js'
import type { FlowLocalFunctionSlot, FlowCloudFunctionSlot } from '../slots.js'

/**
 * Function（函数）节点
 *
 * Function 节点创建新作用域边界（ContextFrame），隔离 vars.state，
 * 执行完毕后返回结果。
 *
 * 两种形态：
 * - localFunction：函数体内联嵌入节点（body 在 slot 中）
 * - cloudFunction：函数体存储在远端，通过 functionId 引用
 */
export interface FlowLocalFunctionNode {
  id: string
  category: NodeCategory.Function
  kind: NodeKind.LocalFunction
  slots: FlowLocalFunctionSlot[]
}

export interface FlowCloudFunctionNode {
  id: string
  category: NodeCategory.Function
  kind: NodeKind.CloudFunction
  slots: FlowCloudFunctionSlot[]
}

export type FlowFunctionNode = FlowLocalFunctionNode | FlowCloudFunctionNode
