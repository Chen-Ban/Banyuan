/**
 * flow.ts — 流程图编辑器前端专属类型
 *
 * 这些类型是编辑器 UX 层的概念，不属于 banvasgl 引擎运行时。
 * 序列化时，FlowValue 转换为 SlotValue（SlotValue = unknown | DataRef）。
 */

// ── FlowValue：编辑器值模型 ──

/**
 * 编辑器中的值来源类型。
 *
 * 序列化为 FlowSchema 时：
 * - literal → 内联值（unknown）
 * - dataRef → DataRef { nodeId: viewId, field: key }
 * - pageDataRef → 运行时按路径从页面上下文取值（亦为 DataRef，field 特殊标记）
 * - eventArg → 运行时从事件参数按 index 取值
 * - nodeRef → DataRef { nodeId, field: 'value' }
 */
export type FlowValueKind = 'literal' | 'dataRef' | 'pageDataRef' | 'eventArg' | 'nodeRef'

export interface FlowValueLiteral {
  kind: 'literal'
  value: unknown
}

export interface FlowValueDataRef {
  kind: 'dataRef'
  viewId: string
  key: string
}

export interface FlowValuePageDataRef {
  kind: 'pageDataRef'
  key: string
}

export interface FlowValueEventArg {
  kind: 'eventArg'
  index: number
}

export interface FlowValueNodeRef {
  kind: 'nodeRef'
  nodeId: string
}

export type FlowValue =
  | FlowValueLiteral
  | FlowValueDataRef
  | FlowValuePageDataRef
  | FlowValueEventArg
  | FlowValueNodeRef

// ── FlowEdge：编辑器中的边元数据（仅用于视图层，不进入 FlowSchema） ──

/**
 * 从 EdgeView 提取的边元数据。
 * 序列化时，边的连接关系写入源节点的 slots[*].next 字段，
 * FlowEdge 仅作为中间数据结构存在。
 */
export interface FlowEdge {
  id: string
  /** 源节点 ID */
  from: string
  /** 目标节点 ID */
  to: string
  /** 源端口的槽位索引（condition 节点多分支时使用） */
  slotIndex?: number
}
