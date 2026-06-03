/**
 * NodeExecutorRegistry —— 节点执行器注册表（操作语义表）
 *
 * ═══════════════════════════════════════════════════════════════════
 * 设计定位：Registry 是 Flow 解释器的「语义表」。
 * ═══════════════════════════════════════════════════════════════════
 *
 * 类比编译原理中的「语义函数」映射：
 *   kind（节点类型名） → executor（该类型的操作语义）
 *
 * 这张表决定了「流程图中每种节点在运行时具体做什么」。
 * 策略模式（Strategy Pattern）使得：
 *   - 扩展性：新增节点类型只需 registry.register(kind, fn)
 *   - 职责分离：前后端注册不同的执行器集合（client preset vs server preset）
 *   - 可测试性：单元测试可以 mock 任意 kind 的执行器
 *
 * 链式 API 设计使得 preset 工厂函数可以一行完成全量注册。
 */

import type { FlowNode } from '../types/schema.js'
import type { FlowValue } from '../types/values.js'
import type { FlowContext } from '../runtime/context.js'

/**
 * 节点执行器返回值类型
 *
 * - 'true'/'false'：condition 分支结果
 * - '__return__'：提前终止流程（return 节点）
 * - void：正常执行完毕，继续下一个节点
 */
export type NodeExecutorResult = 'true' | 'false' | '__return__' | void

/**
 * 节点执行器函数签名
 *
 * @param node - 当前节点数据
 * @param ctx - 执行上下文
 * @param resolve - 值解析器（FlowValue → 实际值）
 * @returns condition 节点返回 'true'/'false'，return 节点返回 '__return__'，其他返回 void
 */
export type NodeExecutor = (
  node: FlowNode,
  ctx: FlowContext,
  resolve: (val: FlowValue) => unknown,
) => Promise<NodeExecutorResult>

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
