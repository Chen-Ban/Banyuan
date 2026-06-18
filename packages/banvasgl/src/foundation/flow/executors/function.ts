/**
 * Function 求值器 —— 内联函数调用
 *
 * 创建新作用域执行子图后返回 `nextNodeId`。
 *
 * 调用 `ctx.runSubGraph(slot.body, inputs)` 在新帧中执行 body，
 * 子图的 Return 节点写入 `returnRef.value`，作为本节点的 outputs 返回。
 * 执行完毕后沿 `slot.next` 推进控制流。
 */

import type { FlowFunctionNode } from '@/types/foundation/flow/nodes/function.js'
import type { NodeExecutor } from '@/types/foundation/flow/executor.js'
import type { CapProxy } from '@/types/foundation/flow/context.js'

export const functionExecutor: NodeExecutor<FlowFunctionNode, CapProxy> = async (node, inputs, ctx) => {
  const slot = node.slots[0]
  const returnValue = await ctx.runSubGraph(slot.body, inputs)
  return { outputs: returnValue, nextNodeId: slot.next || null }
}
