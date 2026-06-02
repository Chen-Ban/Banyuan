import type { NodeExecutor } from '../registry.js'
import type { FlowConditionNode } from '../../types/nodes/shared.js'

export const conditionExecutor: NodeExecutor = async (node, _ctx, resolve) => {
  const { condition } = node as unknown as FlowConditionNode
  const left = resolve(condition.left)
  const right = resolve(condition.right)

  let result: boolean
  switch (condition.op) {
    case '==': result = left == right; break
    case '!=': result = left != right; break
    case '>': result = (left as number) > (right as number); break
    case '>=': result = (left as number) >= (right as number); break
    case '<': result = (left as number) < (right as number); break
    case '<=': result = (left as number) <= (right as number); break
  }

  return result ? 'true' : 'false'
}
