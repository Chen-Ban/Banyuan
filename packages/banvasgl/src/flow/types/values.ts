/**
 * FlowValue —— 流程中的动态值来源（表达式 AST 节点）
 *
 * ═══════════════════════════════════════════════════════════════════
 * 设计定位：FlowValue 是 Flow 解释器中「表达式」的 AST 表示。
 * ═══════════════════════════════════════════════════════════════════
 *
 * 在 Flow 的世界里，所有参数值都不是硬编码的——它们可以来自
 * 多种来源（字面量、变量引用、事件参数、其他节点的输出）。
 * FlowValue 用类型标签（kind）描述「这个值从哪来」，
 * resolveValue() 负责在运行时从 context 中实际取值。
 *
 * 这就像编程语言中表达式可以是字面量（42）、变量引用（x）、
 * 或函数调用的返回值一样——FlowValue 是这种概念的可序列化表达。
 *
 * 5 种 kind 覆盖了所有数据引用场景：
 * - literal: 硬编码字面量（如同 `const x = 42`）
 * - dataRef: 引用指定 scope 下的变量（如同 `obj.key`）
 * - pageDataRef: 引用页面/流程级变量（如同全局变量）
 * - eventArg: 引用触发事件的参数（如同 `arguments[i]`）
 * - nodeRef: 引用值节点的输出（如同嵌套表达式求值）
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
