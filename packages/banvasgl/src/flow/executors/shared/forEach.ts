import type { NodeExecutor } from '../registry.js'
import type { FlowForEachNode } from '../../types/nodes/shared.js'
import type { FlowContext } from '../../runtime/context.js'
import type { FlowRunner } from '../../runtime/FlowRunner.js'

/**
 * forEach 执行器 —— 列表迭代
 *
 * 遍历 collection 中的每个元素，逐一执行内嵌的 body 子流程。
 *
 * 变量作用域设计：
 *   - itemVariable / indexVariable：在子 context 的 local scope 中注入，
 *     仅循环体内可见（每次迭代覆盖）
 *   - 写穿策略：循环体内的 setVariable 直接操作父 context，
 *     允许循环体修改外部变量（如累加器模式）
 *   - eventArgs / env：继承父 context（不隔离）
 *
 * __return__ 冒泡：如果循环体内执行了 return 节点，
 * forEach 立即停止迭代并向上层返回 '__return__'，
 * 使得 return 可以穿透循环终止整个流程。
 */
export const forEachExecutor: NodeExecutor = async (node, ctx, resolve) => {
  const feNode = node as unknown as FlowForEachNode
  const collection = resolve(feNode.collection)

  // 非数组静默跳过（容错：用户可能绑定了空值或非数组数据源）
  if (!Array.isArray(collection)) return

  // 从 ctx.env 获取 FlowRunner（由 FlowRunner.run 自动注入）
  const runner = ctx.env.__runner as FlowRunner | undefined
  if (!runner) {
    console.warn('[forEach] ctx.env.__runner 未注入，无法执行循环体')
    return
  }

  for (let i = 0; i < collection.length; i++) {
    // 创建迭代子 context（变量层面隔离 item/index，其余写穿到父级）
    //
    // 迭代变量只读语义：itemVariable 和 indexVariable 在循环体内是只读的。
    // getVariable 拦截确保读取时始终返回当前迭代的 item/index 值，
    // 而 setVariable 写穿到父作用域——即使循环体内 setVariable 写入同名变量，
    // 也不会影响当前迭代中 getVariable 的读取值（因为 get 优先匹配拦截规则）。
    const iterCtx: FlowContext = {
      getVariable(scope: string, key: string): unknown {
        // itemVariable / indexVariable 拦截：始终返回当前迭代值（只读语义）
        if (scope === 'local' && key === feNode.itemVariable) return collection[i]
        if (scope === 'local' && feNode.indexVariable && key === feNode.indexVariable) return i
        return ctx.getVariable(scope, key) // 向上查找
      },
      setVariable(scope: string, key: string, value: unknown): void {
        ctx.setVariable(scope, key, value) // 写穿到父作用域
      },
      eventArgs: ctx.eventArgs,
      env: ctx.env,
    }

    const result = await runner.run(feNode.body, iterCtx)
    if (result === '__return__') return '__return__' // 内部 return 冒泡
  }
}
