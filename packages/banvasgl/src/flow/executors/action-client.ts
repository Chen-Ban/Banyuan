/**
 * action 执行器 —— 产生副作用
 */

import type { NodeExecutor } from '../registry.js'
import type { FlowSetVariableNode, FlowNavigateNode, FlowCallFlowNode } from '../../types/nodes/action.js'

// ── setVariable ──

export const setVariableExecutor: NodeExecutor<FlowSetVariableNode> = {
  kind: 'setVariable',
  outputPorts: [],
  async execute(node, inputs, _in, ctxState) {
    const target = node.target
    const value = inputs.value

    const parts = target.split('.')
    // target 格式: "state.<layer>.<key...>"
    if (parts[0] === 'state') {
      const layer = parts[1] as 'view' | 'page' | 'app' | 'flow'
      if (layer === 'view') {
        const viewId = parts[2]
        const key = parts.slice(3).join('.')
        if (!ctxState.view[viewId]) ctxState.view[viewId] = {}
        ctxState.view[viewId][key] = value
      } else {
        const key = parts.slice(2).join('.')
        ctxState[layer][key] = value
      }
    }
    return {}
  },
}

// ── navigate ──

export const navigateExecutor: NodeExecutor<FlowNavigateNode> = {
  kind: 'navigate',
  outputPorts: [],
  async execute(_node, inputs, _in, _state, ctxCap) {
    const cap = ctxCap as any
    if (typeof cap.navigate === 'function') {
      await cap.navigate(String(inputs.target ?? ''))
    }
    return {}
  },
}

// ── callFlow ──

export const callFlowExecutor: NodeExecutor<FlowCallFlowNode> = {
  kind: 'callFlow',
  outputPorts: ['result'],
  async execute(_node, inputs, _in, _state, ctxCap) {
    const cap = ctxCap as any
    if (typeof cap.callFlow === 'function') {
      const result = await cap.callFlow(_node.functionId, inputs.args ?? {})
      return { outputs: { result } }
    }
    return { outputs: { result: undefined } }
  },
}
