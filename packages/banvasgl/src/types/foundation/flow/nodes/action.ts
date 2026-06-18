import { NodeCategory, NodeKind } from '../enums.js'
import type {
  FlowSetVariableSlot,
  FlowSetViewDataSlot,
  FlowSetViewVisibleSlot,
  FlowPlayAnimationSlot,
  FlowNavigateSlot,
  FlowHttpRequestSlot,
  FlowCloudFunctionSlot,
  FlowDbQuerySlot,
  FlowDbInsertSlot,
  FlowDbUpdateSlot,
  FlowDbDeleteSlot,
} from '../slots/action.js'

export interface FlowSetVariableNode {
  id: string
  category: NodeCategory.Action
  kind: NodeKind.SetVariable
  slots: FlowSetVariableSlot[]
}

export interface FlowSetViewDataNode {
  id: string
  category: NodeCategory.Action
  kind: NodeKind.SetViewData
  slots: FlowSetViewDataSlot[]
}

export interface FlowSetViewVisibleNode {
  id: string
  category: NodeCategory.Action
  kind: NodeKind.SetViewVisible
  slots: FlowSetViewVisibleSlot[]
}

export interface FlowPlayAnimationNode {
  id: string
  category: NodeCategory.Action
  kind: NodeKind.PlayAnimation
  slots: FlowPlayAnimationSlot[]
}

export interface FlowNavigateNode {
  id: string
  category: NodeCategory.Action
  kind: NodeKind.Navigate
  slots: FlowNavigateSlot[]
}

export interface FlowHttpRequestNode {
  id: string
  category: NodeCategory.Action
  kind: NodeKind.HttpRequest
  slots: FlowHttpRequestSlot[]
}

export interface FlowCloudFunctionNode {
  id: string
  category: NodeCategory.Action
  kind: NodeKind.CloudFunction
  slots: FlowCloudFunctionSlot[]
}

export interface FlowDbQueryNode {
  id: string
  category: NodeCategory.Action
  kind: NodeKind.DbQuery
  slots: FlowDbQuerySlot[]
}

export interface FlowDbInsertNode {
  id: string
  category: NodeCategory.Action
  kind: NodeKind.DbInsert
  slots: FlowDbInsertSlot[]
}

export interface FlowDbUpdateNode {
  id: string
  category: NodeCategory.Action
  kind: NodeKind.DbUpdate
  slots: FlowDbUpdateSlot[]
}

export interface FlowDbDeleteNode {
  id: string
  category: NodeCategory.Action
  kind: NodeKind.DbDelete
  slots: FlowDbDeleteSlot[]
}

export type FlowActionNode =
  | FlowSetVariableNode
  | FlowSetViewDataNode
  | FlowSetViewVisibleNode
  | FlowPlayAnimationNode
  | FlowNavigateNode
  | FlowHttpRequestNode
  | FlowCloudFunctionNode
  | FlowDbQueryNode
  | FlowDbInsertNode
  | FlowDbUpdateNode
  | FlowDbDeleteNode
