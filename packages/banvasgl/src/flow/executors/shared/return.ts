/**
 * returnExecutor —— 提前终止流程
 *
 * 语义：执行到 return 节点时，立即终止当前 FlowSchema 的后续执行。
 * 如果配置了 outputValue，先将解析后的值写入 local 变量 '__return_value__'，
 * 供父流程（callFlow/subFlow）读取。
 */

import type { NodeExecutor } from '../registry.js'
import type { FlowReturnNode } from '../../types/nodes/shared.js'

export const returnExecutor: NodeExecutor = async (node, ctx, resolve) => {
  const returnNode = node as unknown as FlowReturnNode
  if (returnNode.outputValue) {
    const value = resolve(returnNode.outputValue)
    ctx.setVariable('local', '__return_value__', value)
  }
  return '__return__'
}
