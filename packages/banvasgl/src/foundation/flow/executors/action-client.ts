/**
 * action 执行器 —— 产生副作用
 */

import { NodeKind } from '@/types/foundation/flow/enums.js'
import type { NodeExecutor } from "./types.js"
import type { FlowSetVariableNode, FlowNavigateNode } from '@/types/foundation/flow/nodes/action.js'

// ── setVariable ──

export const setVariableExecutor: NodeExecutor<FlowSetVariableNode> = {
  kind: NodeKind.SetVariable,
  outputPorts: [],
  async execute(node, inputs, frame) {
    const target = node.slots[0].input.target as string
    const value = inputs.value

    const parts = target.split('.')
    if (parts[0] === 'state') {
      const layer = parts[1] as 'view' | 'page' | 'app'
      if (layer === 'view') {
        const viewId = parts[2]
        const key = parts.slice(3).join('.')
        if (!frame.state.view[viewId]) frame.state.view[viewId] = {}
        frame.state.view[viewId][key] = value
      } else {
        const key = parts.slice(2).join('.')
        frame.state[layer][key] = value
      }
    } else if (parts[0] === 'vars' && parts[1] === 'local') {
      const key = parts.slice(2).join('.')
      frame.vars.local[key] = value
    }
    return {}
  },
}

// ── navigate ──

export const navigateExecutor: NodeExecutor<FlowNavigateNode> = {
  kind: NodeKind.Navigate,
  outputPorts: [],
  async execute(_node, inputs, frame) {
    const cap = frame.cap as any
    if (typeof cap.navigate === 'function') {
      await cap.navigate(String(inputs.target ?? ''))
    }
    return {}
  },
}
