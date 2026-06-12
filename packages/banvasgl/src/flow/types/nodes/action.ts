/**
 * action 节点 —— 产生副作用
 *
 * 调度：Push 执行。先 Pull 所有输入插槽 → 执行副作用 → 沿控制边继续。
 */

import type { FlowSlot } from '../values.js'
import type { FlowSubSchema } from '../schema.js'

/** 设置变量（唯一写状态口） */
export interface FlowSetVariableNode {
  category: 'action'
  kind: 'setVariable'
  /** 写入目标：state.view.<id>.<prop> | state.page.<key> | state.app.<key> | state.flow.<key> */
  target: string
  value: FlowSlot
  onError?: FlowSubSchema
}

/** 页面导航（必须是终点节点，控制边出度强制为 0） */
export interface FlowNavigateNode {
  category: 'action'
  kind: 'navigate'
  target: FlowSlot
  // 约束: 控制边出度必须为 0（编辑时校验）
}

/** 调用后端云函数 */
export interface FlowCallFlowNode {
  category: 'action'
  kind: 'callFlow'
  functionId: string
  args: Record<string, FlowSlot>
  onError?: FlowSubSchema
  // 输出端口: "result"
}

/** HTTP 请求 */
export interface FlowHttpRequestNode {
  category: 'action'
  kind: 'httpRequest'
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  url: FlowSlot
  headers?: Record<string, FlowSlot>
  body?: FlowSlot
  onError?: FlowSubSchema
  // 输出端口: "status", "body", "headers"
}

/** 数据库查询 */
export interface FlowDbQueryNode {
  category: 'action'
  kind: 'dbQuery'
  collection: string
  filter: FlowSlot
  onError?: FlowSubSchema
  // 输出端口: "rows", "count"
}

/** 数据库插入 */
export interface FlowDbInsertNode {
  category: 'action'
  kind: 'dbInsert'
  collection: string
  document: FlowSlot
  onError?: FlowSubSchema
  // 输出端口: "id"
}

/** 数据库更新 */
export interface FlowDbUpdateNode {
  category: 'action'
  kind: 'dbUpdate'
  collection: string
  filter: FlowSlot
  update: FlowSlot
  onError?: FlowSubSchema
  // 输出端口: "matchedCount", "modifiedCount"
}

/** 数据库删除 */
export interface FlowDbDeleteNode {
  category: 'action'
  kind: 'dbDelete'
  collection: string
  filter: FlowSlot
  onError?: FlowSubSchema
  // 输出端口: "deletedCount"
}

/** action 节点联合 */
export type FlowActionNode =
  | FlowSetVariableNode
  | FlowNavigateNode
  | FlowCallFlowNode
  | FlowHttpRequestNode
  | FlowDbQueryNode
  | FlowDbInsertNode
  | FlowDbUpdateNode
  | FlowDbDeleteNode
