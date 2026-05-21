import type { NodeExecutor } from '../registry.js'
import type { FlowDelayNode } from '../../types/nodes/shared.js'

export const delayExecutor: NodeExecutor = async (node, _ctx, _resolve) => {
  const { ms } = node as unknown as FlowDelayNode
  await new Promise<void>(r => setTimeout(r, ms))
}
