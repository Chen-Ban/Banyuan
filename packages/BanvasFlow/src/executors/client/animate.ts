import type { NodeExecutor } from '../registry.js'
import type { FlowAnimateNode } from '../../types/nodes/client.js'

export const animateExecutor: NodeExecutor = async (node, ctx, _resolve) => {
  const { viewId, animationId } = node as unknown as FlowAnimateNode

  const playAnimation = ctx.env.playAnimation as
    | ((viewId: string, animationId: string) => void)
    | undefined
  if (playAnimation) {
    playAnimation(viewId, animationId)
  } else {
    console.warn('[animate] ctx.env.playAnimation 未注入，跳过动画 %s', animationId)
  }
}
