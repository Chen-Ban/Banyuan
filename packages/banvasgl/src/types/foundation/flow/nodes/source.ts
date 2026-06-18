import { NodeCategory, NodeKind, SourceFrom } from '../enums.js'
import type { FlowDataSlot } from '../slots/data.js'

export interface FlowLiteralSourceNode {
  id: string
  category: NodeCategory.Source
  kind: NodeKind.Source
  from: SourceFrom.Literal
  value: unknown
  slots: FlowDataSlot[]
}

export interface FlowContextSourceNode {
  id: string
  category: NodeCategory.Source
  kind: NodeKind.Source
  from: SourceFrom.Context
  path: string
  slots: FlowDataSlot[]
}

export type FlowSourceNode = FlowLiteralSourceNode | FlowContextSourceNode
