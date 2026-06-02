import type { NodeExecutor } from '../registry.js'
import type { FlowSubFlowNode } from '../../types/nodes/shared.js'
import type { FlowContext } from '../../runtime/context.js'
import type { FlowRunner } from '../../runtime/FlowRunner.js'

/**
 * subFlow 执行器
 *
 * 递归执行内嵌的子流程 schema。
 * 子流程在独立的变量空间中运行（变量隔离），但共享 env 能力。
 *
 * 输入参数通过父级 ctx 中以 `__subflow_input_{name}` 为 key 的变量传入。
 * 输出结果写回父级 ctx 中以 `__subflow_output_{name}` 为 key 的变量。
 *
 * 这种约定使得 subFlow 可以像普通节点一样通过边（toParam）接收数据。
 */
export const subFlowExecutor: NodeExecutor = async (node, ctx, _resolve) => {
  const { body, inputs, outputs } = node as unknown as FlowSubFlowNode

  if (!body || !body.nodes.length) return

  // 从 ctx.env 获取 FlowRunner（由 FlowRunner.run 自动注入）
  const parentRunner = ctx.env.__runner as FlowRunner | undefined
  if (!parentRunner) {
    console.warn('[subFlow] ctx.env.__runner 未注入，无法执行子流程')
    return
  }

  // 构造子流程的隔离变量空间
  const subVariables = new Map<string, unknown>()

  // 将父级通过边传入的参数写入子上下文
  for (const input of inputs) {
    const val = ctx.getVariable('local', `__subflow_input_${input.name}`)
    if (val !== undefined) {
      subVariables.set(input.name, val)
    }
  }

  const subCtx: FlowContext = {
    eventArgs: ctx.eventArgs,
    env: { ...ctx.env },  // 共享 env 能力但不污染父级
    getVariable(_scope: string, key: string): unknown {
      return subVariables.get(key)
    },
    setVariable(_scope: string, key: string, value: unknown): void {
      subVariables.set(key, value)
    },
  }

  // 递归执行子流程
  await parentRunner.run(body, subCtx)

  // 将子流程的输出变量写回父上下文
  for (const output of outputs) {
    const val = subVariables.get(output.name)
    if (val !== undefined) {
      ctx.setVariable('local', `__subflow_output_${output.name}`, val)
    }
  }
}
