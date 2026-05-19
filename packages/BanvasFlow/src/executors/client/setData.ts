import type { NodeExecutor } from '../registry.js'
import type { FlowSetDataNode } from '../../types/nodes/client.js'

export const setDataExecutor: NodeExecutor = async (node, ctx, resolve) => {
  const { viewId, key, value } = node as unknown as FlowSetDataNode
  const resolved = resolve(value)

  // 通过 env.setViewData 注入的前端能力写入 View 数据
  const setViewData = ctx.env.setViewData as
    | ((viewId: string, key: string, value: unknown) => void)
    | undefined
  if (setViewData) {
    setViewData(viewId, key, resolved)
  } else {
    // 降级：写入上下文变量表
    ctx.setVariable(viewId, key, resolved)
  }
}
