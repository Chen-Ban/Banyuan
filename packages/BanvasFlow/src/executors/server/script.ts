import type { NodeExecutor } from '../registry.js'
import type { FlowScriptNode } from '../../types/nodes/server.js'
import type { FlowValue } from '../../types/values.js'

/**
 * script 执行器 —— Node.js vm 模块沙箱执行用户脚本
 *
 * 安全措施：
 * - 通过 vm.runInNewContext 隔离（无法访问 require/process/globalThis）
 * - 支持 timeout 防无限循环
 * - inputBindings → 脚本可访问的变量
 * - 脚本返回值按 outputBindings 写回上下文
 */
export const scriptExecutor: NodeExecutor = async (node, ctx, resolve) => {
  const n = node as unknown as FlowScriptNode
  const timeout = n.timeout ?? 5000

  // 解析输入绑定
  const sandbox: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(n.inputBindings)) {
    sandbox[key] = resolve(val as FlowValue)
  }

  try {
    // 动态引入 vm 模块（仅 Node.js 环境）
    const vm = await import('node:vm')

    // 包装为立即执行函数，返回结果对象
    const wrappedCode = `(function() { ${n.code} })()`
    const result = vm.runInNewContext(wrappedCode, sandbox, { timeout })

    // 将结果按 outputBindings 写入变量
    if (result && typeof result === 'object' && n.outputBindings) {
      for (const [resultKey, varKey] of Object.entries(n.outputBindings)) {
        if (!varKey) continue
        const val = (result as Record<string, unknown>)[resultKey]
        if (val !== undefined) {
          ctx.setVariable('local', varKey, val)
        }
      }
    }
  } catch (err) {
    throw new Error(`[FlowRunner:script] 脚本执行失败: ${(err as Error).message}`)
  }
}
