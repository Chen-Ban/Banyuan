import type { NodeExecutor } from '../registry.js'
import type { FlowSetVisibleNode } from '../../types/nodes/client.js'

export const setVisibleExecutor: NodeExecutor = async (node, ctx, _resolve) => {
  const { viewId, visible } = node as unknown as FlowSetVisibleNode

  const setViewVisible = ctx.env.setViewVisible as
    | ((viewId: string, visible: boolean) => void)
    | undefined
  if (setViewVisible) {
    setViewVisible(viewId, visible)
  } else {
    console.warn('[setVisible] ctx.env.setViewVisible 未注入，跳过')
  }
}
