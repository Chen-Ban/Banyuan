/**
 * FlowSchema —— 流程图的核心数据结构
 */

import type { SharedFlowNode } from './nodes/shared.js'
import type { ClientFlowNode } from './nodes/client.js'
import type { ServerFlowNode } from './nodes/server.js'

/**
 * FlowSchema 格式版本号
 *
 * 当 FlowSchema 的结构发生 breaking change 时递增此版本。
 * BanvasGL 的全局 Migration 函数通过此常量判断是否需要对
 * View.events/lifetimes 中嵌套的 FlowSchema 执行格式变换。
 */
export const FLOW_SCHEMA_VERSION = '1.0.0'

/** 值节点（不参与控制流，仅产出值供参数引用） */
export interface FlowVarNode {
  kind: 'variable'
  viewId: string
  key: string
}

export interface FlowPageVarNode {
  kind: 'pageVar'
  key: string
}

export interface FlowEventParamNode {
  kind: 'eventParam'
  index: number
}

export type FlowValueNode = FlowVarNode | FlowPageVarNode | FlowEventParamNode

/** 所有动作节点的联合 */
export type FlowActionNode = SharedFlowNode | ClientFlowNode | ServerFlowNode

/** FlowNode = 动作节点 | 值节点，附加公共字段 */
export type FlowNode = { id: string; x?: number; y?: number } & (FlowActionNode | FlowValueNode)

/** 有向边 */
export interface FlowEdge {
  /** 边的唯一标识（编辑器画布管理 + 序列化需要） */
  id: string
  from: string
  to: string
  /** 条件分支边的标签 */
  branch?: 'true' | 'false'
  /** 数据流边：指定目标节点的哪个参数槽 */
  toParam?: string
}

/** 流程图完整结构 */
export interface FlowSchema {
  nodes: FlowNode[]
  edges: FlowEdge[]
}
