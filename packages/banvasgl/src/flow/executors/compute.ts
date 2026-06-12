/**
 * compute 执行器 —— 纯变换
 */

import type { FlowMathNode, FlowCompareNode, FlowLogicNode, FlowConcatNode, FlowFormatNode, FlowGetNode } from '../../types/nodes/compute.js'
import type { NodeExecutor } from '../registry.js'

// ── math ──

export const mathExecutor: NodeExecutor<FlowMathNode> = {
  kind: 'math',
  outputPorts: ['value'],
  async execute(node, inputs) {
    const a = inputs.a as number
    const b = inputs.b as number
    const ops: Record<string, (a: number, b: number) => number> = {
      add: (a, b) => a + b, sub: (a, b) => a - b, mul: (a, b) => a * b,
      div: (a, b) => a / b, mod: (a, b) => a % b, pow: (a, b) => a ** b,
      min: Math.min, max: Math.max,
    }
    return { outputs: { value: ops[node.op](a, b) } }
  },
}

// ── compare ──

export const compareExecutor: NodeExecutor<FlowCompareNode> = {
  kind: 'compare',
  outputPorts: ['value'],
  async execute(node, inputs) {
    const a = inputs.a as any, b = inputs.b as any
    let result: boolean
    switch (node.op) {
      case 'eq': result = a === b; break
      case 'neq': result = a !== b; break
      case 'gt': result = a > b; break
      case 'gte': result = a >= b; break
      case 'lt': result = a < b; break
      case 'lte': result = a <= b; break
    }
    return { outputs: { value: result } }
  },
}

// ── logic ──

export const logicExecutor: NodeExecutor<FlowLogicNode> = {
  kind: 'logic',
  outputPorts: ['value'],
  async execute(node, inputs) {
    const vals = (inputs.operands as any[]) ?? []
    switch (node.op) {
      case 'and': return { outputs: { value: vals.every(Boolean) } }
      case 'or':  return { outputs: { value: vals.some(Boolean) } }
      case 'not': return { outputs: { value: !vals[0] } }
    }
  },
}

// ── concat ──

export const concatExecutor: NodeExecutor<FlowConcatNode> = {
  kind: 'concat',
  outputPorts: ['value'],
  async execute(node, inputs) {
    const parts = (inputs.parts as any[]) ?? []
    const sep = node.separator ?? ''
    return { outputs: { value: parts.map(String).join(sep) } }
  },
}

// ── format ──

export const formatExecutor: NodeExecutor<FlowFormatNode> = {
  kind: 'format',
  outputPorts: ['value'],
  async execute(node, inputs) {
    const values = (inputs.values ?? {}) as Record<string, unknown>
    let result = node.template
    for (const [key, val] of Object.entries(values)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(val))
    }
    return { outputs: { value: result } }
  },
}

// ── get ──

export const getExecutor: NodeExecutor<FlowGetNode> = {
  kind: 'get',
  outputPorts: ['value'],
  async execute(node, inputs) {
    const obj = inputs.object as any
    if (obj == null) return { outputs: { value: undefined } }
    const parts = node.path.split('.')
    let current = obj
    for (const key of parts) {
      if (current == null) break
      current = current[key]
    }
    return { outputs: { value: current } }
  },
}
