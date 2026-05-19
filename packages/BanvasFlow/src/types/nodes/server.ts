/**
 * 后端专属节点 —— 仅在 Node.js 环境执行
 */

import type { FlowValue } from '../values.js'

/** 数据库查询 */
export interface FlowDbQueryNode {
  kind: 'dbQuery'
  collection: string
  filter: Record<string, FlowValue>
  projection?: Record<string, 1 | 0>
  sort?: Record<string, 1 | -1>
  limit?: number
  outputVariable: string // 查询结果写入哪个变量
}

/** 数据库插入 */
export interface FlowDbInsertNode {
  kind: 'dbInsert'
  collection: string
  document: Record<string, FlowValue>
  outputVariable: string // insertedId 写入哪个变量
}

/** 数据库更新 */
export interface FlowDbUpdateNode {
  kind: 'dbUpdate'
  collection: string
  filter: Record<string, FlowValue>
  update: Record<string, FlowValue>
  outputVariable: string // modifiedCount 写入哪个变量
}

/** 数据库删除 */
export interface FlowDbDeleteNode {
  kind: 'dbDelete'
  collection: string
  filter: Record<string, FlowValue>
  outputVariable: string // deletedCount 写入哪个变量
}

/** HTTP 请求 */
export interface FlowHttpRequestNode {
  kind: 'httpRequest'
  url: FlowValue
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  headers?: Record<string, FlowValue>
  body?: FlowValue
  outputVariable: string // response 写入哪个变量
}

/** 表达式转换（安全子集，不支持任意 JS） */
export interface FlowTransformNode {
  kind: 'transform'
  expression: string // 安全表达式（如 expr-eval 语法）
  variables: Record<string, FlowValue> // 表达式中可引用的变量
  outputVariable: string
}

/** 自定义脚本节点（vm 沙箱执行） */
export interface FlowScriptNode {
  kind: 'script'
  code: string
  inputBindings: Record<string, FlowValue>
  outputBindings: Record<string, string> // 脚本返回对象的 key → 写入哪个变量
  timeout?: number // 超时毫秒数，默认 5000
}

/** 后端节点联合 */
export type ServerFlowNode =
  | FlowDbQueryNode
  | FlowDbInsertNode
  | FlowDbUpdateNode
  | FlowDbDeleteNode
  | FlowHttpRequestNode
  | FlowTransformNode
  | FlowScriptNode
