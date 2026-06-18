/**
 * source 求值器 —— 叶子数据源
 */

import type { FlowSourceNode } from '@/types/foundation/flow/nodes/source.js'
import { NodeKind } from '@/types/foundation/flow/enums.js'
import type { NodeEvaluator } from "./types.js"

export const sourceExecutor: NodeEvaluator<FlowSourceNode> = {
  // 单一执行器同时覆盖 Literal 和 Context 两种 source 类型，
  // 注册时映射为 literal / context 两个 key（见 presets）
  kind: NodeKind.Literal,
  outputPorts: ['value'],

  async evaluate(node, _inputs, ctx) {
    if (node.kind === NodeKind.Literal) {
      return { outputs: { value: node.slots[0].value } }
    }
    // path 格式：支持 "vars.in.xxx" 或 "in.xxx" / "local.xxx"
    const path = node.slots[0].path
    const parts = path.split('.')
    // 兼容旧格式 "vars.in.xxx" → 去掉 "vars" 前缀
    const effectiveParts = parts[0] === 'vars' ? parts.slice(1) : parts
    const root = effectiveParts[0]
    if (root === 'in') {
      const key = effectiveParts.slice(1).join('.')
      return { outputs: { value: key ? (ctx.stack.in as any)[key] : ctx.stack.in } }
    }
    if (root === 'local') {
      const key = effectiveParts.slice(1).join('.')
      return { outputs: { value: key ? (ctx.stack.local as any)[key] : ctx.stack.local } }
    }
    return { outputs: { value: undefined } }
  },
}
