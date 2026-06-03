import type { NodeExecutor } from '../registry.js'
import type { FlowParallelNode } from '../../types/nodes/shared.js'
import type { FlowContext } from '../../runtime/context.js'
import type { FlowRunner } from '../../runtime/FlowRunner.js'

/**
 * parallel 执行器 —— 并行执行多条子流程
 *
 * 根据 joinMode 决定汇聚策略：
 *   - 'all'（默认）：等待所有分支完成（Promise.all）
 *   - 'any'：任一分支完成即继续（Promise.race），其余分支仍会继续执行
 *     （JS 无法取消已启动的 Promise）
 *
 * 变量作用域设计：
 *   - 各分支拥有独立的局部变量 Map（branchLocals）
 *   - setVariable('local', ...) 写入分支独立 Map，非 local scope 写入父 ctx
 *   - getVariable('local', ...) 先查分支独立 Map，找不到再查父 ctx
 *   - ⚠️ 非 local scope 的并发写入仍有竞态风险，使用者需自行注意
 *
 * __return__ 不冒泡设计决策：
 *   parallel 分支内的 return 仅终止该分支，不冒泡到 parallel 外层。
 *   原因：
 *     1. parallel 的语义是"执行多条独立任务"，各分支是隔离的执行单元
 *     2. 如果用户想在 parallel 之后终止流程，应在 parallel 节点之后放 return 节点
 *     3. 这避免了 race 条件下 return 信号丢失的问题（any 模式下快分支完成
 *        而慢分支的 return 信号无法被 Promise.race 捕获）
 *
 * resultsVariable 存储各分支局部变量对象的数组（Record<string, unknown>[]）。
 */
export const parallelExecutor: NodeExecutor = async (node, ctx, resolve) => {
  const pNode = node as unknown as FlowParallelNode
  void resolve // parallel 节点自身不解析 FlowValue 参数

  // 防御：无分支静默跳过
  if (!pNode.branches || pNode.branches.length === 0) return

  // 从 ctx.env 获取 FlowRunner（由 FlowRunner.run 自动注入）
  const runner = ctx.env.__runner as FlowRunner | undefined
  if (!runner) {
    console.warn('[parallel] ctx.env.__runner 未注入，无法执行并行分支')
    return
  }

  // 为每条分支创建独立的局部变量 Map 和隔离 context
  const branchLocalsList: Map<string, unknown>[] = []
  const promises = pNode.branches.map((branch, idx) => {
    const branchLocals = new Map<string, unknown>()
    branchLocalsList[idx] = branchLocals

    const branchCtx: FlowContext = {
      getVariable(scope: string, key: string): unknown {
        // local scope 先查分支独立 Map，找不到再查父 ctx
        if (scope === 'local') {
          if (branchLocals.has(key)) return branchLocals.get(key)
          return ctx.getVariable(scope, key)
        }
        return ctx.getVariable(scope, key)
      },
      setVariable(scope: string, key: string, value: unknown): void {
        if (scope === 'local') {
          // local scope 写入分支独立 Map
          branchLocals.set(key, value)
        } else {
          // 非 local scope 写穿到父作用域（⚠️ 并发竞态）
          ctx.setVariable(scope, key, value)
        }
      },
      eventArgs: ctx.eventArgs,
      env: ctx.env,
    }
    // runner.run 返回值仅用于判断分支是否提前结束（不冒泡）
    return runner.run(branch, branchCtx)
  })

  // 根据 joinMode 决定汇聚策略（默认 'all'）
  const joinMode = pNode.joinMode ?? 'all'

  if (joinMode === 'any') {
    await Promise.race(promises)
  } else {
    await Promise.all(promises)
  }

  // 将各分支的 branchLocals 转为对象数组，写入 resultsVariable
  const results = branchLocalsList.map(locals => {
    const obj: Record<string, unknown> = {}
    for (const [k, v] of locals) {
      obj[k] = v
    }
    return obj
  })
  ctx.setVariable('local', pNode.resultsVariable, results)
}
