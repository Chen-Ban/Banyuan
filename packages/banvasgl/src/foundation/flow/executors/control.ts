/**
 * Control 求值器 —— 控制流节点（Condition / Loop / Parallel / Return）
 *
 * Control 节点决定流程的执行路径，不产出业务数据。
 * Filter 求值（`evaluateFilter` / `logicEval` / `compareEval`）已迁移至 FlowRunner，
 * executor 通过 `ctx.evaluateFilter()` 调用。
 *
 * 四种 control 节点：
 * - **Condition**：按 slot 顺序逐一求值 filter，首个匹配的分支沿其 `next` 推进
 * - **Loop**：while(filter) 循环执行 body 子图，退出后沿 `next` 推进
 * - **Parallel**：并行执行 body 数组中的多个子图（各自独立 FrameStack），
 *   按 `mode` 决定收敛策略（All / AllSettled / Race / Any）
 * - **Return**：将当前 inputs 写入 `ctx.stack.returnRef.value`，终止子图执行
 */

import { ParallelMode } from '@/types/foundation/flow/enums.js'
import type {
  FlowConditionNode,
  FlowLoopNode,
  FlowParallelNode,
} from '@/types/foundation/flow/nodes/control.js'
import type { NodeExecutor } from '@/types/foundation/flow/executor.js'
import { FrameStack } from '../context/index.js'
import type { CapProxy } from '@/types/foundation/flow/context.js'

// ═══════════════════════════════════════════════════════════
// Condition
// ═══════════════════════════════════════════════════════════

/**
 * Condition 执行器：按 slot 顺序逐一求值 filter，首个匹配的分支沿其 `next` 推进。
 *
 * 遍历 `node.slots`，每个 slot 的 `filter` 通过 `ctx.evaluateFilter()` 求值。
 * 首个 true 的 slot 返回其 `next` 作为下一节点 ID。
 * 全部不匹配时返回 `nextNodeId: null`（流程终止）。
 */
export const conditionExecutor: NodeExecutor<FlowConditionNode, CapProxy> = async (node, _inputs, ctx) => {
  for (const slot of node.slots) {
    if (await ctx.evaluateFilter(slot.filter)) {
      return { outputs: {}, nextNodeId: slot.next || null }
    }
  }
  return { outputs: {}, nextNodeId: null }
}

/**
 * Loop 执行器：while(filter) 循环执行 body 子图。
 *
 * 每次迭代前求值 `slot.filter`，为 true 时调用 `ctx.runSubGraph(slot.body, {})`。
 * filter 首次为 false 或循环退出后，返回 `slot.next` 作为下一节点 ID。
 * 迭代次数受 MAX_STEPS 全局限制。
 */
export const loopExecutor: NodeExecutor<FlowLoopNode, CapProxy> = async (node, _inputs, ctx) => {
  const slot = node.slots[0]
  while (await ctx.evaluateFilter(slot.filter)) {
    await ctx.runSubGraph(slot.body, {})
  }
  return { outputs: {}, nextNodeId: slot.next || null }
}

/**
 * Parallel 执行器：并行执行 body 数组中的多个子图，按 mode 收敛。
 *
 * 每个 body 子图获得独立 FrameStack，避免竞态。
 * mode 决定收敛策略：
 * - `All`：全部成功（任一失败抛错）
 * - `AllSettled`：全部完成（不抛错）
 * - `Race`：首个完成的子图结果（其余继续执行但不被消费）
 * - `Any`：首个成功的子图结果（全部失败抛 AggregateError）
 *
 * 收敛后返回 `slot.next` 作为下一节点 ID。
 */
export const parallelExecutor: NodeExecutor<FlowParallelNode, CapProxy> = async (node, _inputs, ctx) => {
  const slot = node.slots[0]
  const tasks = slot.body.map((b) => {
    const branchStack = new FrameStack()
    return ctx.runSubGraph(b, {}, branchStack)
  })

  switch (slot.mode) {
    case ParallelMode.All:
      await Promise.all(tasks)
      break
    case ParallelMode.AllSettled:
      await Promise.allSettled(tasks)
      break
    case ParallelMode.Race:
      await Promise.race(tasks)
      break
    case ParallelMode.Any:
      await Promise.any(tasks)
      break
  }

  return { outputs: {}, nextNodeId: slot.next || null }
}

/**
 * Return 执行器：将当前 inputs 写入 `ctx.stack.returnRef.value`，终止子图执行。
 *
 * 不沿控制路径推进（`nextNodeId: null`）。
 * runGraph 在节点为 null 时返回 `returnRef.value`，调用方通过 runSubGraph 的返回值获取。
 */
export const returnExecutor: NodeExecutor = async (_node, inputs, ctx) => {
  ctx.stack.returnRef.value = inputs
  return { outputs: inputs, nextNodeId: null }
}
