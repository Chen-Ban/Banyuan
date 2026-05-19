import type { NodeExecutor } from '../registry.js'
import type { FlowSetVariableNode } from '../../types/nodes/shared.js'

export const setVariableExecutor: NodeExecutor = async (node, ctx, resolve) => {
  const { scope, key, value } = node as unknown as FlowSetVariableNode
  const resolved = resolve(value)
  ctx.setVariable(scope, key, resolved)
}
