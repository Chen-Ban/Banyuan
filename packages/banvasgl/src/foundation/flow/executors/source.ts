/**
 * Source 求值器 —— 叶子数据源
 *
 * 覆盖 Literal 和 Context 两种 NodeKind（共用同一执行器，注册时映射为两个 key）。
 *
 * - **Literal**：直接返回 `node.slots[0].value`（内联字面量）
 * - **Context**：按 `node.slots[0].path` 从当前帧栈读取值
 *   - `in.xxx` → 读取当前帧的只读入参
 *   - `local.xxx` → 读取当前帧的可读写临时变量
 *   - `vars.in.xxx` / `vars.local.xxx` → 兼容旧写法
 *
 * Source 节点不在控制路径上（无 `next` 字段），仅被其他节点的 Pull 阶段
 * 通过 DataRef 引用时惰性求值。
 */

import type { FlowSourceNode } from '@/types/foundation/flow/nodes/source.js'
import { NodeKind } from '@/types/foundation/flow/enums.js'
import type { NodeExecutor } from '@/types/foundation/flow/executor.js'
import type { CapProxy } from '@/types/foundation/flow/context.js'

/**
 * Source 节点执行器（Literal + Context 二合一）。
 *
 * 注册时映射为 `literal` / `context` 两个 key（见 presets），
 * 运行时通过 `node.kind` 区分行为。
 *
 * @param node - Literal 或 Context 节点
 * @param _inputs - Source 无输入（忽略）
 * @param ctx - 运行时上下文（访问 frameStack 读取 in/local 变量）
 * @returns `{ outputs: { value }, nextNodeId: null }`
 */
export const sourceExecutor: NodeExecutor<FlowSourceNode, CapProxy> = async (node, _inputs, ctx) => {
  if (node.kind === NodeKind.Literal) {
    return { outputs: { value: node.slots[0].value }, nextNodeId: null }
  }
  const path = node.slots[0].path
  const parts = path.split('.')
  const effectiveParts = parts[0] === 'vars' ? parts.slice(1) : parts
  const root = effectiveParts[0]
  if (root === 'in') {
    const key = effectiveParts.slice(1).join('.')
    return { outputs: { value: key ? (ctx.stack.in as any)[key] : ctx.stack.in }, nextNodeId: null }
  }
  if (root === 'local') {
    const key = effectiveParts.slice(1).join('.')
    return { outputs: { value: key ? (ctx.stack.local as any)[key] : ctx.stack.local }, nextNodeId: null }
  }
  return { outputs: { value: undefined }, nextNodeId: null }
}
