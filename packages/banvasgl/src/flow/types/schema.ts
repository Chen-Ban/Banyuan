/**
 * FlowSchema —— 流程图的核心数据结构
 *
 * FlowSchema 是一棵以有向图形态承载的过程式 AST。
 * 采用 Push-Pull 混合调度：Push 沿 ControlEdge 推进，Pull 沿 DataEdge 求值。
 * 顶层图为开放 DAG（显式 entry，控制边出度 0 即自然结束），
 * 子图（FlowSubSchema）为可调用闭包（显式 subEntry + subExit）。
 *
 * 节点按调度行为分四类（category）：
 *   control — 选路（condition/while/forEach/parallel/subFlow）
 *   action  — 副作用（setVariable/navigate/callFlow/httpRequest/db*）
 *   source  — 叶子数据源（literal/context）
 *   compute — 纯变换（math/compare/logic/concat/format/get）
 *
 * 边分两种：
 *   ControlEdge — 串执行顺序，不携带业务数据。Push 沿它推进。
 *   DataEdge   — 连接输出端口到输入插槽。Pull 沿它反向递归求值。
 */

import type { FlowControlNode } from './nodes/control.js'
import type { FlowActionNode } from './nodes/action.js'
import type { FlowSourceNode } from './nodes/source.js'
import type { FlowComputeNode } from './nodes/compute.js'

/** FlowSchema 格式版本号 */
export const FLOW_SCHEMA_VERSION = '2.0.0'

/** 控制边：串起执行顺序。Push 沿它推进。不携带业务数据。 */
export interface FlowControlEdge {
  id: string
  from: string
  to: string
  /** condition 分支标签（匹配 case.label 或 "default"）。省略 = 单出口 */
  branch?: string
}

/** 数据边：连接输出端口到输入插槽。Pull 沿它反向递归求值。 */
export interface FlowDataEdge {
  id: string
  fromNode: string
  /** 源节点的输出端口名。source/compute 为 "value"，action 由执行器定义 */
  fromPort: string
  toNode: string
  /** 目标节点的输入插槽名 */
  toSlot: string
}

/** 顶层流程定义 —— 开放 DAG */
export interface FlowSchema {
  version: string
  /** 显式入口节点 ID（必须是 control 或 action） */
  entry: string
  nodes: Record<string, FlowNode>
  controlEdges: FlowControlEdge[]
  dataEdges: FlowDataEdge[]
}

/** 子图定义 —— 可调用闭包（SESE 控制流属性） */
export interface FlowSubSchema {
  subEntry: string
  subExit: string
  nodes: Record<string, FlowNode>
  controlEdges: FlowControlEdge[]
  dataEdges: FlowDataEdge[]
  /** subFlow 专有：形参声明 */
  params?: { name: string; type: 'string' | 'number' | 'boolean' | 'object' | 'array' }[]
}

/** 所有节点的联合类型 */
export type FlowNode = { id: string } & (
  | FlowControlNode
  | FlowActionNode
  | FlowSourceNode
  | FlowComputeNode
)

/** 节点分类字面量 */
export type NodeCategory = 'control' | 'action' | 'source' | 'compute'
