/**
 * FlowValue —— 流程中的动态值来源
 *
 * 5 种值来源覆盖了所有数据引用场景：
 * - literal: 硬编码字面量
 * - dataRef: 引用指定 scope 下的变量（前端=View.data，后端=context变量）
 * - pageDataRef: 引用页面/流程级变量
 * - eventArg: 引用触发事件的参数
 * - nodeRef: 引用值节点的输出
 */

/** 字面量值 */
export interface FlowLiteralValue {
  kind: 'literal'
  value: string | number | boolean | null | object
}

/** 引用某个 scope 下的变量（前端：viewId.key，后端：scope.key） */
export interface FlowDataRefValue {
  kind: 'dataRef'
  viewId: string // 前端=viewId，后端=scope名。'self' 表示当前上下文
  key: string
}

/** 引用页面级/流程级变量 */
export interface FlowPageDataRefValue {
  kind: 'pageDataRef'
  key: string
}

/** 引用事件参数（按索引） */
export interface FlowEventArgValue {
  kind: 'eventArg'
  index: number
}

/** 引用另一个值节点的输出 */
export interface FlowNodeRefValue {
  kind: 'nodeRef'
  nodeId: string
}

/** 值联合类型 */
export type FlowValue =
  | FlowLiteralValue
  | FlowDataRefValue
  | FlowPageDataRefValue
  | FlowEventArgValue
  | FlowNodeRefValue

/** 条件表达式 */
export interface FlowCondition {
  left: FlowValue
  op: '==' | '!=' | '>' | '>=' | '<' | '<='
  right: FlowValue
}
