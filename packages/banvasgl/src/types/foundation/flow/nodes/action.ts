import { NodeCategory, NodeKind } from '../enums.js'
import type { FlowActionSlot } from '../slots.js'

export interface FlowSetVariableNode {
  id: string
  category: NodeCategory.Action
  kind: NodeKind.SetVariable
  slots: FlowActionSlot[]
}

export interface FlowNavigateNode {
  id: string
  category: NodeCategory.Action
  kind: NodeKind.Navigate
  slots: FlowActionSlot[]
}

export interface FlowHttpRequestNode {
  id: string
  category: NodeCategory.Action
  kind: NodeKind.HttpRequest
  method: string
  slots: FlowActionSlot[]
}

/** 云函数 = HTTP 调用后端执行指定函数，结构同 HttpRequest + functionId */
export interface FlowCloudFunctionNode {
  id: string
  category: NodeCategory.Action
  kind: NodeKind.CloudFunction
  method: string
  functionId: string
  slots: FlowActionSlot[]
}

export interface FlowDbQueryNode {
  id: string
  category: NodeCategory.Action
  kind: NodeKind.DbQuery
  collection: string
  slots: FlowActionSlot[]
}

export interface FlowDbInsertNode {
  id: string
  category: NodeCategory.Action
  kind: NodeKind.DbInsert
  collection: string
  slots: FlowActionSlot[]
}

export interface FlowDbUpdateNode {
  id: string
  category: NodeCategory.Action
  kind: NodeKind.DbUpdate
  collection: string
  slots: FlowActionSlot[]
}

export interface FlowDbDeleteNode {
  id: string
  category: NodeCategory.Action
  kind: NodeKind.DbDelete
  collection: string
  slots: FlowActionSlot[]
}

export type FlowActionNode =
  | FlowSetVariableNode
  | FlowNavigateNode
  | FlowHttpRequestNode
  | FlowCloudFunctionNode
  | FlowDbQueryNode
  | FlowDbInsertNode
  | FlowDbUpdateNode
  | FlowDbDeleteNode
