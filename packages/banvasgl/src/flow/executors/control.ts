/**
 * control 执行器 —— 选路（无副作用）
 *
 * 注：condition/while/forEach/parallel/subFlow 由 FlowRunner 内置处理，
 * 不在 executor registry 中注册。此文件仅作为类型参考。
 * FlowRunner.executeControl() 直接分发这些节点的逻辑。
 */

import type { NodeExecutor } from '../registry.js'
import type { FlowConditionNode, FlowWhileNode, FlowForEachNode, FlowParallelNode, FlowSubFlowNode } from '../../types/nodes/control.js'

// 以下为占位执行器（FlowRunner 内置处理，这些仅用于类型完备性）
// 实际执行逻辑在 FlowRunner.executeControl() 中

export const conditionExecutor: NodeExecutor<FlowConditionNode> = {
  kind: 'condition',
  outputPorts: [],
  async execute() { throw new Error('condition is handled internally by FlowRunner') },
}

export const whileExecutor: NodeExecutor<FlowWhileNode> = {
  kind: 'while',
  outputPorts: [],
  async execute() { throw new Error('while is handled internally by FlowRunner') },
}

export const forEachExecutor: NodeExecutor<FlowForEachNode> = {
  kind: 'forEach',
  outputPorts: [],
  async execute() { throw new Error('forEach is handled internally by FlowRunner') },
}

export const parallelExecutor: NodeExecutor<FlowParallelNode> = {
  kind: 'parallel',
  outputPorts: ['result'],
  async execute() { throw new Error('parallel is handled internally by FlowRunner') },
}

export const subFlowExecutor: NodeExecutor<FlowSubFlowNode> = {
  kind: 'subFlow',
  outputPorts: [],
  async execute() { throw new Error('subFlow is handled internally by FlowRunner') },
}
