/**
 * 节点执行器类型定义
 *
 * 每个 kind 对应一个 NodeExecutor，定义了该节点在运行时的操作语义。
 * 前后端通过不同的预组装 presets 提供不同的执行器集合。
 */

import type { FlowNode } from '@/types/foundation/flow/index.js'
import type { ContextFrame } from '../context/ContextFrame.js'

/** 执行器执行结果 */
export interface NodeExecResult {
  outputs?: Record<string, unknown>
  error?: Error
}

/** 节点执行器接口 */
export interface NodeExecutor<T extends FlowNode = FlowNode> {
  readonly kind: string
  readonly outputPorts: string[]

  execute(
    node: T,
    resolvedInputs: Record<string, unknown>,
    frame: ContextFrame,
  ): Promise<NodeExecResult>
}
