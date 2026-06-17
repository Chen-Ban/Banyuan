export * from './control.js'
export * from './source.js'
export * from './compute.js'
export * from './action.js'
export * from './function.js'

import type { FlowControlNode } from './control.js'
import type { FlowActionNode } from './action.js'
import type { FlowSourceNode } from './source.js'
import type { FlowComputeNode } from './compute.js'
import type { FlowFunctionNode } from './function.js'

export type FlowNode = FlowControlNode | FlowActionNode | FlowSourceNode | FlowComputeNode | FlowFunctionNode
