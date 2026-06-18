/**
 * Compute 求值器 —— 纯计算/变换节点
 *
 * Compute 节点是纯函数：输入完全来自 DataRef 或内联字面量，
 * 不访问 `cap` / `stack` / 任何外部状态。产出统一放在 `outputs.value`。
 *
 * 包含六种 compute 节点：
 * - **Math**：加减乘除、取模、幂、最值（MathOp 八种运算）
 * - **Compare**：相等/不等/大于/大于等于/小于/小于等于/包含（CompareOp 七种运算）
 * - **Logic**：与/或/非（LogicOp 三种运算）
 * - **Concat**：字符串拼接（可选分隔符）
 * - **Format**：模板字符串替换（`{key}` → 对应 values[key]）
 * - **Get**：按点号分隔路径从 object 取嵌套字段
 *
 * 所有配置（op/template/path 等）均从已解析的 `inputs` 读取。
 * Compute 节点不在控制路径上（`nextNodeId` 始终为 null），仅被 Pull 阶段惰性求值。
 */

import { MathOp, CompareOp, LogicOp } from '@/types/foundation/flow/enums.js'
import type { NodeExecutor } from '@/types/foundation/flow/executor.js'

// ── math ──

export const mathExecutor: NodeExecutor = async (_node, inputs) => {
  const op = inputs.op as MathOp
  const a = inputs.a as number
  const b = inputs.b as number
  switch (op) {
    case MathOp.Add: return { outputs: { value: a + b }, nextNodeId: null }
    case MathOp.Sub: return { outputs: { value: a - b }, nextNodeId: null }
    case MathOp.Mul: return { outputs: { value: a * b }, nextNodeId: null }
    case MathOp.Div: return { outputs: { value: a / b }, nextNodeId: null }
    case MathOp.Mod: return { outputs: { value: a % b }, nextNodeId: null }
    case MathOp.Pow: return { outputs: { value: a ** b }, nextNodeId: null }
    case MathOp.Min: return { outputs: { value: Math.min(a, b) }, nextNodeId: null }
    case MathOp.Max: return { outputs: { value: Math.max(a, b) }, nextNodeId: null }
    default: return { outputs: { value: 0 }, nextNodeId: null }
  }
}

// ── compare ──

export const compareExecutor: NodeExecutor = async (_node, inputs) => {
  const op = inputs.op as CompareOp
  const a = inputs.a as number
  const b = inputs.b as number
  switch (op) {
    case CompareOp.Eq:  return { outputs: { value: a === b }, nextNodeId: null }
    case CompareOp.Neq: return { outputs: { value: a !== b }, nextNodeId: null }
    case CompareOp.Gt:  return { outputs: { value: a > b }, nextNodeId: null }
    case CompareOp.Gte: return { outputs: { value: a >= b }, nextNodeId: null }
    case CompareOp.Lt:  return { outputs: { value: a < b }, nextNodeId: null }
    case CompareOp.Lte: return { outputs: { value: a <= b }, nextNodeId: null }
    case CompareOp.Contains: return { outputs: { value: String(a).includes(String(b)) }, nextNodeId: null }
    default: return { outputs: { value: false }, nextNodeId: null }
  }
}

// ── logic ──

export const logicExecutor: NodeExecutor = async (_node, inputs) => {
  const op = inputs.op as LogicOp
  const a = inputs.a
  const b = inputs.b
  switch (op) {
    case LogicOp.And: return { outputs: { value: !!(a && b) }, nextNodeId: null }
    case LogicOp.Or:  return { outputs: { value: !!(a || b) }, nextNodeId: null }
    case LogicOp.Not: return { outputs: { value: !a }, nextNodeId: null }
    default: return { outputs: { value: false }, nextNodeId: null }
  }
}

// ── concat ──

export const concatExecutor: NodeExecutor = async (_node, inputs) => {
  const a = String(inputs.a ?? '')
  const b = String(inputs.b ?? '')
  const sep = (inputs.separator as string) ?? ''
  return { outputs: { value: a + sep + b }, nextNodeId: null }
}

// ── format ──

export const formatExecutor: NodeExecutor = async (_node, inputs) => {
  let tmpl = String(inputs.template ?? '')
  const vals = inputs.values as Record<string, unknown> ?? {}
  for (const [k, v] of Object.entries(vals)) {
    tmpl = tmpl.replace(new RegExp('\\{' + k + '\\}', 'g'), String(v))
  }
  return { outputs: { value: tmpl }, nextNodeId: null }
}

// ── get ──

export const getExecutor: NodeExecutor = async (_node, inputs) => {
  const obj = inputs.object as Record<string, unknown> | null | undefined
  if (obj == null) return { outputs: { value: undefined }, nextNodeId: null }
  const parts = String(inputs.path ?? '').split('.')
  let cur: any = obj
  for (const p of parts) {
    if (cur == null) return { outputs: { value: undefined }, nextNodeId: null }
    cur = cur[p]
  }
  return { outputs: { value: cur }, nextNodeId: null }
}
