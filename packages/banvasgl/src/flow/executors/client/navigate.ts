import type { NodeExecutor } from '../registry.js'
import type { FlowNavigateNode } from '../../types/nodes/client.js'

export const navigateExecutor: NodeExecutor = async (node, ctx, _resolve) => {
  const { pageId } = node as unknown as FlowNavigateNode

  const navigateTo = ctx.env.navigateTo as
    | ((pageId: string) => void)
    | undefined
  if (navigateTo) {
    navigateTo(pageId)
  } else {
    console.warn('[navigate] ctx.env.navigateTo 未注入，跳过导航到 %s', pageId)
  }
}
