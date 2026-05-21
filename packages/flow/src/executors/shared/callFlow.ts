import type { NodeExecutor } from '../registry.js'
import type { FlowCallFlowNode } from '../../types/nodes/shared.js'

/**
 * callFlow 执行器
 *
 * 通过 ctx.env 中注入的 callFlow 函数实现跨环境调用：
 * - 前端：env.callFlow 发起 HTTP POST 到后端 FlowRunner
 * - 后端：env.callFlow 直接本地调用另一个 FlowSchema
 */
export const callFlowExecutor: NodeExecutor = async (node, ctx, resolve) => {
  const { flowId, inputBindings, outputBindings } = node as unknown as FlowCallFlowNode

  // 解析入参
  const input: Record<string, unknown> = {}
  for (const [key, flowValue] of Object.entries(inputBindings)) {
    input[key] = resolve(flowValue)
  }

  // 调用环境注入的 callFlow 函数
  const callFlow = ctx.env.callFlow as
    | ((flowId: string, input: Record<string, unknown>) => Promise<Record<string, unknown>>)
    | undefined
  if (!callFlow) {
    console.warn('[callFlow] ctx.env.callFlow 未注入，跳过')
    return
  }

  const result = await callFlow(flowId, input)

  // 将结果按 outputBindings 写入变量
  if (result && outputBindings) {
    for (const [resultKey, varKey] of Object.entries(outputBindings)) {
      if (!varKey) continue
      const val = result[resultKey]
      if (val !== undefined) {
        ctx.setVariable('local', varKey, val)
      }
    }
  }
}
