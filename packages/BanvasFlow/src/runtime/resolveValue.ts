/**
 * resolveValue —— 将 FlowValue 解析为运行时实际值
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
