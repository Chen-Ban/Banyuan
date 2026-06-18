/**
 * 节点求值器类型定义
 *
 * NodeEvaluator 是数据节点的纯求值函数：接收已解析的输入和运行时帧，
 * 产出 { outputs } 或 { error }。它不参与控制流决策，不关心 next 跳转，
 * 不操作帧栈。
 *
 * 前后端通过不同的预组装 presets 提供不同的求值器集合。
 *
 * 注意：只有 Source / Compute / Action 三类节点需要 NodeEvaluator；
 * Control / Function 节点由 FlowRunner 内部方法直接解释执行，不需要求值器。
 */

import type { FlowNode } from '@/types/foundation/flow/index.js'
import type { IRunnerCtx } from '@/types/foundation/flow/context.js'

/** 求值结果 */
export interface EvalResult {
  outputs?: Record<string, unknown>
  error?: Error
}

/** 节点求值器接口 */
export interface NodeEvaluator<T extends FlowNode = FlowNode> {
  readonly kind: string
  readonly outputPorts: string[]

  evaluate(
    node: T,
    resolvedInputs: Record<string, unknown>,
    ctx: IRunnerCtx,
  ): Promise<EvalResult>
}
