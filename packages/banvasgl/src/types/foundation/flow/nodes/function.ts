import { NodeCategory, NodeKind } from '../enums.js'
import type { FlowFunctionSlot } from '../slots/function.js'

export interface FlowFunctionNode {
  id: string
  category: NodeCategory.Function
  kind: NodeKind.Function
  slots: FlowFunctionSlot[]
}
