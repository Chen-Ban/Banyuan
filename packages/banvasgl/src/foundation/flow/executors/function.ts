/**
 * function executor（stub）
 *
 * Function 节点的实际执行走 FlowRunner.invokeFunction 硬编码，
 * localFunction / cloudFunction 的差异（body 嵌入 vs loadFunctionBody）
 * 在 invokeFunction 中抹平为统一的 FlowSchema → runGraph 路径。
 *
 * 此 executor 为占位 stub，供将来可能的 executor 模式使用。
 */
import type { FlowFunctionNode } from '@/types/foundation/flow/nodes/function.js'
import type { NodeExecutor } from "./types.js"

export const functionExecutor: NodeExecutor<FlowFunctionNode> = {
  kind: 'function',
  outputPorts: [],
  async execute(_node, _inputs, _frame) {
    return { outputs: {} }
  },
}
