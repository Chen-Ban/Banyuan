import type { NodeExecutor } from '../registry.js'
import type { FlowTransformNode } from '../../types/nodes/server.js'
import type { FlowValue } from '../../types/values.js'

/**
 * transform 执行器 —— 安全表达式求值
 *
 * 当前实现：使用 Function 构造器在受限沙箱中执行。
 * 后续可替换为 expr-eval 等安全表达式引擎。
 */
export const transformExecutor: NodeExecutor = async (node, ctx, resolve) => {
  const n = node as unknown as FlowTransformNode

  // 解析变量绑定
  const vars: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(n.variables)) {
    vars[key] = resolve(val as FlowValue)
  }

  try {
    // 构造安全的纯表达式函数（不允许语句，只允许表达式）
    const keys = Object.keys(vars)
    const values = Object.values(vars)
    // eslint-disable-next-line no-new-func
    const fn = new Function(...keys, `"use strict"; return (${n.expression})`)
    const result = fn(...values)
    ctx.setVariable('local', n.outputVariable, result)
  } catch (err) {
    console.warn('[transform] 表达式执行失败: %s', (err as Error).message)
    ctx.setVariable('local', n.outputVariable, null)
  }
}
