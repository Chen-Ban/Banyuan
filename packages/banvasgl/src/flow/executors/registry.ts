/**
 * NodeExecutorRegistry —— 节点执行器注册表
 *
 * 每个 kind 对应一个 NodeExecutor，定义了该节点在运行时的操作语义。
 * 前后端通过不同的预组装 presets 注册不同的执行器集合。
 */

import type { FlowNode } from '../types/schema.js'

/** 执行器执行结果 */
export interface NodeExecResult {
  /** 命名输出端口 → 值。key = 端口名（如 "rows", "count", "value", "result"） */
  outputs?: Record<string, unknown>
  /** condition 命中分支的 label */
  branch?: string
  /** 执行失败时的错误对象 */
  error?: Error
}

/** 节点执行器接口 */
export interface NodeExecutor<T extends FlowNode = FlowNode> {
  /** 节点 kind */
  readonly kind: string
  /** 该节点暴露的输出端口名列表 */
  readonly outputPorts: string[]

  /**
   * 执行节点
   * @param node - 节点数据
   * @param resolvedInputs - 已解析的输入插槽值（key = 插槽名）
   * @param ctxIn - 入参（只读）
   * @param ctxState - 分层状态（可读写）
   * @param ctxCap - 能力句柄（仅 action 可见）
   */
  execute(
    node: T,
    resolvedInputs: Record<string, unknown>,
    ctxIn: Readonly<Record<string, unknown>>,
    ctxState: { view: Record<string, Record<string, unknown>>; page: Record<string, unknown>; app: Record<string, unknown>; flow: Record<string, unknown> },
    ctxCap: Record<string, unknown>,
  ): Promise<NodeExecResult>
}

/** 节点执行器注册表 */
export class NodeExecutorRegistry {
  private executors = new Map<string, NodeExecutor>()

  register(executor: NodeExecutor): this {
    this.executors.set(executor.kind, executor)
    return this
  }

  get(kind: string): NodeExecutor | undefined {
    return this.executors.get(kind)
  }

  has(kind: string): boolean {
    return this.executors.has(kind)
  }

  kinds(): string[] {
    return [...this.executors.keys()]
  }
}
