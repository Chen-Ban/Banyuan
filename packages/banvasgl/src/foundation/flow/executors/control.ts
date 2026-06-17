/**
 * control executors（stub，未被 preset 使用）
 *
 * condition/parallel 走 FlowRunner.pushControl 硬编码。
 */
import type { FlowConditionNode, FlowParallelNode } from '@/types/foundation/flow/nodes/control.js'
import { NodeKind } from '@/types/foundation/flow/enums.js'
import type { NodeExecutor } from "./types.js"

export const conditionExecutor: NodeExecutor<FlowConditionNode> = {
  kind: NodeKind.Condition,
  outputPorts: [],
  async execute(_node, _inputs, _frame) {
    return { outputs: {} }
  },
}

export const parallelExecutor: NodeExecutor<FlowParallelNode> = {
  kind: NodeKind.Parallel,
  outputPorts: ['result'],
  async execute(_node, _inputs, _frame) {
    return { outputs: {} }
  },
}
