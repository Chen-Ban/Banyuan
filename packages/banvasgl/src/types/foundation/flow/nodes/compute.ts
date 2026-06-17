import { NodeCategory, NodeKind, MathOp, CompareOp, LogicOp } from '../enums.js'
import type { FlowDataSlot } from '../slots.js'

export interface FlowMathNode {
  id: string
  category: NodeCategory.Compute
  kind: NodeKind.Math
  op: MathOp
  slots: FlowDataSlot[]
}

export interface FlowCompareNode {
  id: string
  category: NodeCategory.Compute
  kind: NodeKind.Compare
  op: CompareOp
  slots: FlowDataSlot[]
}

export interface FlowLogicNode {
  id: string
  category: NodeCategory.Compute
  kind: NodeKind.Logic
  op: LogicOp
  slots: FlowDataSlot[]
}

export interface FlowConcatNode {
  id: string
  category: NodeCategory.Compute
  kind: NodeKind.Concat
  slots: FlowDataSlot[]
}

export interface FlowFormatNode {
  id: string
  category: NodeCategory.Compute
  kind: NodeKind.Format
  template: string
  slots: FlowDataSlot[]
}

export interface FlowGetNode {
  id: string
  category: NodeCategory.Compute
  kind: NodeKind.Get
  path: string
  slots: FlowDataSlot[]
}

export type FlowComputeNode =
  | FlowMathNode
  | FlowCompareNode
  | FlowLogicNode
  | FlowConcatNode
  | FlowFormatNode
  | FlowGetNode
