/**
 * source 节点 —— 叶子数据源（无输入、单输出、无副作用）
 *
 * 调度：Pull 求值。被 DataEdge 引用时直接出值。
 * 输出端口统一为 "value"。
 */

/** 字面量源节点 */
export interface FlowLiteralSourceNode {
  category: 'source'
  kind: 'source'
  from: 'literal'
  /** 任意 JSON 值 */
  value: unknown
}

/** 上下文取值源节点 */
export interface FlowContextSourceNode {
  category: 'source'
  kind: 'source'
  from: 'context'
  /** 取值路径。首段限定 "in" | "state"，如 "state.page.userName" */
  path: string
}

/** source 节点联合 */
export type FlowSourceNode = FlowLiteralSourceNode | FlowContextSourceNode
