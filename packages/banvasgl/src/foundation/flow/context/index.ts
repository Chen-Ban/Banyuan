export type { FlowEnv, IRuntimeContext, IFrameStack, IFlowRunner, FrontendCapProxy, BackendCapProxy, CapProxy, Vars, State } from '@/types/foundation/flow/context.js'
export { ContextFrame } from './ContextFrame.js'
export { FrameStack } from './FrameStack.js'

import type { FlowNode } from '@/types/foundation/flow/index.js'
import type { FrameStack as FrameStackType } from './FrameStack.js'

/** 执行上下文——FlowRunner 实现此接口供工具函数消费 */
export interface RunnerCtx {
  nodes: Record<string, FlowNode>;
  stack: FrameStackType;
  executed: Set<string>;
  outputs: Map<string, Record<string, unknown>>;
  returnRef: { value: Record<string, unknown> };
  steps: number;
  execute: (node: FlowNode) => Promise<FlowNode | null>;
}
