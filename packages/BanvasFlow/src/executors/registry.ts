/**
 * NodeExecutorRegistry —— 节点执行器注册表
 *
 * 策略模式：FlowRunner 通过 kind 查找对应的执行器函数。
 * 使用链式 API 方便预组装。
 */

import type { FlowNode } from '../types/schema.js'
import type { FlowValue } from '../types/values.js'
import type { FlowContext } from '../runtime/context.js'

/**
 * 节点执行器函数签名
 *
 * @param node - 当前节点数据
 * @param ctx - 执行上下文
 * @param resolve - 值解析器（FlowValue → 实际值）
 * @returns condition 节点返回 'true'/'false'，其他返回 void
 */
export type NodeExecutor = (
  node: FlowNode,
  ctx: FlowContext,
  resolve: (val: FlowValue) => unknown,
) => Promise<'true' | 'false' | void>

export class NodeExecutorRegistry {
  private executors = new Map<string, NodeExecutor>()

  /** 注册一个节点执行器（链式调用） */
  register(kind: string, executor: NodeExecutor): this {
    this.executors.set(kind, executor)
    return this
  }

  /** 获取节点执行器 */
  get(kind: string): NodeExecutor | undefined {
    return this.executors.get(kind)
  }

  /** 检查是否已注册 */
  has(kind: string): boolean {
    return this.executors.has(kind)
  }

  /** 获取所有已注册的 kind 列表 */
  kinds(): string[] {
    return [...this.executors.keys()]
  }
}
