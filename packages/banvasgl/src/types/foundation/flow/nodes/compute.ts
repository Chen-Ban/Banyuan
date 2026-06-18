import { NodeCategory, NodeKind } from '../enums.js'
import type {
  FlowMathSlot,
  FlowCompareSlot,
  FlowLogicSlot,
  FlowConcatSlot,
  FlowFormatSlot,
  FlowGetSlot,
} from '../slots/compute.js'

export interface FlowMathNode {
  id: string
  category: NodeCategory.Compute
  kind: NodeKind.Math
  slots: FlowMathSlot[]
}

export interface FlowCompareNode {
  id: string
  category: NodeCategory.Compute
  kind: NodeKind.Compare
  slots: FlowCompareSlot[]
}

export interface FlowLogicNode {
  id: string
  category: NodeCategory.Compute
  kind: NodeKind.Logic
  slots: FlowLogicSlot[]
}

export interface FlowConcatNode {
  id: string
  category: NodeCategory.Compute
  kind: NodeKind.Concat
  slots: FlowConcatSlot[]
}

export interface FlowFormatNode {
  id: string
  category: NodeCategory.Compute
  kind: NodeKind.Format
  slots: FlowFormatSlot[]
}

export interface FlowGetNode {
  id: string
  category: NodeCategory.Compute
  kind: NodeKind.Get
  slots: FlowGetSlot[]
}

export type FlowComputeNode =
  | FlowMathNode
  | FlowCompareNode
  | FlowLogicNode
  | FlowConcatNode
  | FlowFormatNode
  | FlowGetNode
