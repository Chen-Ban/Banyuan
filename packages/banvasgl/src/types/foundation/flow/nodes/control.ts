import { NodeCategory, NodeKind, ParallelMode } from '../enums.js'
import type { FlowConditionSlot, FlowLoopSlot, FlowParallelSlot } from '../slots.js'

/**
 * Control（控制流）节点
 *
 * Control 节点在当前 scope 内路由执行路径：
 * - condition：条件分支（每 slot 一个 match 分支）
 * - loop：循环（单 slot = while(filter) { body }）
 * - parallel：并行（每 slot 一个并行分支）
 *
 * 注：localFunction 已独立为 Function 类（NodeCategory.Function），
 * 因其语义是作用域封装/子图调用而非路由控制。
 */

export interface FlowConditionNode {
  id: string
  category: NodeCategory.Control
  kind: NodeKind.Condition
  slots: FlowConditionSlot[]
}

export interface FlowLoopNode {
  id: string
  category: NodeCategory.Control
  kind: NodeKind.Loop
  slots: FlowLoopSlot[]
}

export interface FlowParallelNode {
  id: string
  category: NodeCategory.Control
  kind: NodeKind.Parallel
  slots: FlowParallelSlot[]
  mode: ParallelMode
}

export type FlowControlNode =
  | FlowConditionNode
  | FlowLoopNode
  | FlowParallelNode
