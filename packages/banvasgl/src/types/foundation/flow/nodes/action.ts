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

/**
 * HTTP 请求节点。
 * slot.input: { url, method?, headers?, body? }
 * slot.output: ['status', 'body', 'headers']
 */
export interface FlowHttpRequestNode {
  id: string
  category: NodeCategory.Action
  kind: NodeKind.HttpRequest
  slots: FlowActionSlot[]
}

/**
 * 云函数节点 = HTTP POST 调用后端执行指定函数。
 * slot.input: { functionId, method?, args? }
 * slot.output: ['status', 'body', 'headers']
 */
export interface FlowCloudFunctionNode {
  id: string
  category: NodeCategory.Action
  kind: NodeKind.CloudFunction
  slots: FlowActionSlot[]
}

/**
 * 数据库查询。
 * slot.input: { collection, filter? }
 * slot.output: ['rows', 'count']
 */
export interface FlowDbQueryNode {
  id: string
  category: NodeCategory.Action
  kind: NodeKind.DbQuery
  slots: FlowActionSlot[]
}

/**
 * 数据库插入。
 * slot.input: { collection, document }
 * slot.output: ['id']
 */
export interface FlowDbInsertNode {
  id: string
  category: NodeCategory.Action
  kind: NodeKind.DbInsert
  slots: FlowActionSlot[]
}

/**
 * 数据库更新。
 * slot.input: { collection, filter, update }
 * slot.output: ['matchedCount', 'modifiedCount']
 */
export interface FlowDbUpdateNode {
  id: string
  category: NodeCategory.Action
  kind: NodeKind.DbUpdate
  slots: FlowActionSlot[]
}

/**
 * 数据库删除。
 * slot.input: { collection, filter? }
 * slot.output: ['deletedCount']
 */
export interface FlowDbDeleteNode {
  id: string
  category: NodeCategory.Action
  kind: NodeKind.DbDelete
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
