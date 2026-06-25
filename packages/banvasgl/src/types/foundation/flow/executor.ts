/**
 * 节点执行器类型定义
 *
 * NodeExecutor 是统一的节点执行函数签名：接收已解析的输入和运行时上下文，
 * 产出 `{ outputs?, error?, nextNodeId }`。它负责数据产出和下一步节点 ID 决策，
 * Runner 负责帧栈管理、缓存、ID→节点映射、错误恢复和步数限制。
 *
 * v2.1.0 核心变更：
 * - 从基于 `NodeExecutorRegistry` 类的旧模型升级为纯函数 + 类型化注册表
 * - `ExecutorRegistry` 从 `Record<string, NodeExecutor>` 升级为映射类型
 *   `{ [K in NodeKind]?: NodeExecutor<NodeForKind<K>, C> }`，
 *   每个字段的 node 参数类型由 `NodeForKind` 自动推导，消除 as 断言
 * - registry key 本身就是 NodeKind，无需 executor 声明 kind 字段
 *
 * 前后端通过不同的预组装 presets 提供不同的执行器集合。
 *
 * @typeParam N - 执行器实际接收的节点具体类型（声明时约束，注册时擦除为 FlowNode）
 * @typeParam C - 能力代理具体类型（FrontendCapProxy / BackendCapProxy）
 */

import type { FlowNode } from './index.js'
import type { IRunnerCtx } from './context.js'
import type { CapProxy } from './context.js'
import type { NodeKind } from './enums.js'

/**
 * 节点求值结果 —— executor 的执行产出。
 *
 * Runner 的 stepNode 将此结果写入 outputCache，
 * 后续同一帧内再次引用同一节点时直接返回缓存结果。
 */
export interface NodeEvalResult {
  /** executor 产出的键值对（如 dbQuery → { rows, count }） */
  outputs?: Record<string, unknown>
  /** 执行中捕获的错误（存在时 Runner 优先走 onError 子图而非直接抛错） */
  error?: Error
  /**
   * 下一节点 ID（null = 流程终止）。
   *
   * executor 从 `node.slots[*].next` 读取并返回。Source/Compute 始终返回 null。
   */
  nextNodeId: string | null
}

/**
 * 节点执行器 —— 纯函数签名。
 *
 * registry key 本身已承载 kind 信息，无需 executor 声明 kind 字段。
 *
 * @typeParam N - 节点具体类型
 * @typeParam C - 能力代理类型
 * @param node - 当前节点（类型由 registry 的 K 推导）
 * @param resolvedInputs - 已解析的输入值（Runer 的 pullSlots 阶段完成 DataRef → 具体值）
 * @param ctx - 运行时上下文（stack / cap / runSubGraph / evaluateFilter）
 * @returns NodeEvalResult
 */
export type NodeExecutor<N extends FlowNode = FlowNode, C extends CapProxy = CapProxy> = (
  node: N,
  resolvedInputs: Record<string, unknown>,
  ctx: IRunnerCtx<C>,
) => Promise<NodeEvalResult>

// ── 类型化注册表 ──

/**
 * 从 FlowNode 联合中按 kind 提取具体节点类型。
 *
 * 利用 TypeScript `Extract` 工具类型，例如：
 * `NodeForKind<NodeKind.Math>` → `FlowMathNode`
 *
 * 用于 `ExecutorRegistry` 的字段类型自动推导。
 */
export type NodeForKind<K extends NodeKind> = Extract<FlowNode, { kind: K }>

/**
 * 类型化执行器注册表 —— 按 NodeKind 索引的映射类型。
 *
 * 每个字段的 `node` 参数类型由 `NodeForKind<K>` 自动推导，
 * 消除 executor 函数签名中的 `as` 断言。
 *
 * 所有条目可选（`?`）：前端/后端 preset 各自填充不同子集。
 * Runner 的 dispatch 在 switch 中取出对应字段，类型天然匹配。
 *
 * @typeParam C - 能力代理类型
 */
export type ExecutorRegistry<C extends CapProxy = CapProxy> = {
  [K in NodeKind]?: NodeExecutor<NodeForKind<K>, C>
}
