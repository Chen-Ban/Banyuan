/**
 * resolveValue —— 将 FlowValue 解析为运行时实际值
 *
 * ═══════════════════════════════════════════════════════════════════
 * 设计定位：resolveValue 是 Flow 解释器的「表达式求值器」。
 * ═══════════════════════════════════════════════════════════════════
 *
 * 在编程语言中，表达式（expression）需要在环境（environment）中
 * 被求值（evaluate）才能得到具体的值。resolveValue 就是这个求值过程：
 *
 *   FlowValue（表达式描述） + FlowContext（环境） → 实际值
 *
 * 5 种 FlowValue kind 对应不同的求值策略：
 *   - literal    → 字面量，直接返回（如同代码中的 42 或 "hello"）
 *   - dataRef    → 变量引用，从 context 的作用域中查找（如同 scope.key）
 *   - pageDataRef → 页面级变量引用（如同全局变量）
 *   - eventArg   → 事件参数，按位置索引取值（如同函数参数 arguments[i]）
 *   - nodeRef    → 值节点引用，递归求值另一个节点（如同表达式嵌套）
 *
 * 这个函数被 FlowRunner 以闭包形式传给每个 executor，
 * 使得 executor 可以透明地解析参数值，而无需关心值的来源。
 */

import type { FlowValue } from '../types/values.js'
import type { FlowNode } from '../types/schema.js'
import type { FlowContext } from './context.js'

/**
 * 值节点直接求值
 */
function resolveValueNode(
  node: FlowNode,
  ctx: FlowContext,
): unknown {
  switch (node.kind) {
    case 'variable':
      return ctx.getVariable(node.viewId, node.key)
    case 'pageVar':
      return ctx.getVariable('page', node.key)
    case 'eventParam':
      return ctx.eventArgs[node.index]
    default:
      return undefined
  }
}

/**
 * 将 FlowValue 解析为运行时实际值
 *
 * @param val - 要解析的值描述
 * @param ctx - 执行上下文
 * @param nodeMap - 节点表（用于 nodeRef 查找）
 */
export function resolveValue(
  val: FlowValue,
  ctx: FlowContext,
  nodeMap?: Map<string, FlowNode>,
): unknown {
  switch (val.kind) {
    case 'literal':
      return val.value

    case 'dataRef':
      return ctx.getVariable(val.viewId, val.key)

    case 'pageDataRef':
      return ctx.getVariable('page', val.key)

    case 'eventArg':
      return ctx.eventArgs[val.index]

    case 'nodeRef': {
      if (!nodeMap) return undefined
      const valueNode = nodeMap.get(val.nodeId)
      if (!valueNode) return undefined
      return resolveValueNode(valueNode, ctx)
    }
  }
}
