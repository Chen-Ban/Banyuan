/**
 * source 执行器 —— 叶子数据源
 */

import type { FlowSourceNode } from '../../types/nodes/source.js'
import type { NodeExecutor } from '../registry.js'
import { contextGet } from '../../runtime/context.js'

export const sourceExecutor: NodeExecutor<FlowSourceNode> = {
  kind: 'source',
  outputPorts: ['value'],

  async execute(node, _inputs, ctxIn, ctxState) {
    if (node.from === 'literal') {
      return { outputs: { value: node.value } }
    }
    // from === 'context'
    return { outputs: { value: contextGet(node.path, ctxIn, ctxState) } }
  },
}
