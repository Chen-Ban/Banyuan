/**
 * source 执行器 —— 叶子数据源
 */

import type { FlowSourceNode } from '@/types/foundation/flow/nodes/source.js'
import { NodeKind } from '@/types/foundation/flow/enums.js'
import type { NodeExecutor } from "./types.js"

export const sourceExecutor: NodeExecutor<FlowSourceNode> = {
  kind: NodeKind.Literal,
  outputPorts: ['value'],

  async execute(node, _inputs, frame) {
    if (node.kind === NodeKind.Literal) {
      return { outputs: { value: node.slots[0].value } }
    }
    return { outputs: { value: frame.get(node.slots[0].path) } }
  },
}
