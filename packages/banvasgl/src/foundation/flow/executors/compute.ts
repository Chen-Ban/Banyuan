/**
 * compute executor
 */
import type { FlowMathNode, FlowCompareNode, FlowLogicNode, FlowConcatNode, FlowFormatNode, FlowGetNode } from '@/types/foundation/flow/nodes/compute.js'
import { NodeKind, MathOp, CompareOp, LogicOp } from '@/types/foundation/flow/enums.js'
import type { NodeExecutor } from "./types.js"

export const mathExecutor: NodeExecutor<FlowMathNode> = {
  kind: NodeKind.Math,
  outputPorts: ['value'],
  async execute(node, inputs) {
    const a = inputs.a as number
    const b = inputs.b as number
    switch (node.op) {
      case MathOp.Add: return { outputs: { value: a + b } }
      case MathOp.Sub: return { outputs: { value: a - b } }
      case MathOp.Mul: return { outputs: { value: a * b } }
      case MathOp.Div: return { outputs: { value: a / b } }
      case MathOp.Mod: return { outputs: { value: a % b } }
      case MathOp.Pow: return { outputs: { value: a ** b } }
      case MathOp.Min: return { outputs: { value: Math.min(a, b) } }
      case MathOp.Max: return { outputs: { value: Math.max(a, b) } }
      default: return { outputs: { value: 0 } }
    }
  },
}

export const compareExecutor: NodeExecutor<FlowCompareNode> = {
  kind: NodeKind.Compare,
  outputPorts: ['value'],
  async execute(node, inputs) {
    const a = inputs.a as number
    const b = inputs.b as number
    switch (node.op) {
      case CompareOp.Eq:  return { outputs: { value: a === b } }
      case CompareOp.Neq: return { outputs: { value: a !== b } }
      case CompareOp.Gt:  return { outputs: { value: a > b } }
      case CompareOp.Gte: return { outputs: { value: a >= b } }
      case CompareOp.Lt:  return { outputs: { value: a < b } }
      case CompareOp.Lte: return { outputs: { value: a <= b } }
      default: return { outputs: { value: false } }
    }
  },
}

export const logicExecutor: NodeExecutor<FlowLogicNode> = {
  kind: NodeKind.Logic,
  outputPorts: ['value'],
  async execute(node, inputs) {
    const vals = (inputs.operands as any[]) ?? []
    switch (node.op) {
      case LogicOp.And: return { outputs: { value: vals.every(Boolean) } }
      case LogicOp.Or:  return { outputs: { value: vals.some(Boolean) } }
      case LogicOp.Not: return { outputs: { value: !vals[0] } }
      default: return { outputs: { value: false } }
    }
  },
}

export const concatExecutor: NodeExecutor<FlowConcatNode> = {
  kind: NodeKind.Concat,
  outputPorts: ['value'],
  async execute(node, inputs) {
    const parts = (inputs.parts as any[]) ?? []
    const sep = (inputs.separator as string) ?? ''
    return { outputs: { value: parts.map(String).join(sep) } }
  },
}

export const formatExecutor: NodeExecutor<FlowFormatNode> = {
  kind: NodeKind.Format,
  outputPorts: ['value'],
  async execute(node, inputs) {
    let tmpl = node.template
    const vals = inputs.values as Record<string, unknown> ?? {}
    for (const [k, v] of Object.entries(vals)) {
      tmpl = tmpl.replace(new RegExp('\\{' + k + '\\}', 'g'), String(v))
    }
    return { outputs: { value: tmpl } }
  },
}

export const getExecutor: NodeExecutor<FlowGetNode> = {
  kind: NodeKind.Get,
  outputPorts: ['value'],
  async execute(node, inputs) {
    const obj = inputs.object as Record<string, unknown> | null | undefined
    if (obj == null) return { outputs: { value: undefined } }
    const parts = node.path.split('.')
    let cur: any = obj
    for (const p of parts) {
      if (cur == null) return { outputs: { value: undefined } }
      cur = cur[p]
    }
    return { outputs: { value: cur } }
  },
}
