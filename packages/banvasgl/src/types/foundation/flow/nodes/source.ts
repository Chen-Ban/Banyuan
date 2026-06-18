import { NodeCategory, NodeKind } from '../enums.js'
import type { FlowLiteralSourceSlot, FlowContextSourceSlot } from '../slots/source.js'

export interface FlowLiteralSourceNode {
  id: string
  category: NodeCategory.Source
  kind: NodeKind.Literal
  slots: FlowLiteralSourceSlot[]
}

export interface FlowContextSourceNode {
  id: string
  category: NodeCategory.Source
  kind: NodeKind.Context
  slots: FlowContextSourceSlot[]
}

export type FlowSourceNode = FlowLiteralSourceNode | FlowContextSourceNode
