/**
 * FlowRunner —— FlowSchema 核心调度器（解释器主循环）
 *
 * ═══════════════════════════════════════════════════════════════════
 * 设计定位：FlowRunner 是 Flow 解释器的「eval 循环」。
 * ═══════════════════════════════════════════════════════════════════
 *
 * 类比经典解释器 `eval(ast, env)`：
 *   - ast = FlowSchema（节点图）
 *   - env = FlowContext（变量表 + 平台能力）
 *   - eval = FlowRunner.run()（遍历节点图，逐一 dispatch 到执行器）
 *
 * FlowRunner 自身是 kind-agnostic 的——它不知道世界上存在哪些节点类型，
 * 只知道：从 registry 中按 kind 查找执行器 → 调用 → 根据返回值选下一条边。
 * 这是策略模式（Strategy Pattern）的应用：
 *   - 新增节点类型 = 注册新执行器，FlowRunner 零修改
 *   - 前端/后端差异 = registry 中注册不同的执行器集合
 *
 * 每个 NodeExecutor 就是该节点 kind 的「操作语义」——
 * 它定义了这个节点在运行时的确切行为。FlowRunner 负责调度顺序，
 * executor 负责执行副作用，context 负责提供能力。三者职责分离。
 *
 * ═══════════════════════════════════════════════════════════════════
 * 执行模型
 * ═══════════════════════════════════════════════════════════════════
 *
 * 1. 建图：nodes → nodeMap, edges → edgeMap
 * 2. 找入口：无入边的第一个动作节点（值节点跳过）
 * 3. 主循环：执行当前节点 → 查找出边 → 移动到下一节点
 * 4. 分支：condition 节点返回 'true'/'false' → 选择对应 branch 的边
 * 5. 安全阀：MAX_STEPS = 1000，防止 schema 设计错误导致死循环
 */

import type { FlowSchema, FlowNode, FlowEdge } from '../types/schema.js'
import type { FlowValue } from '../types/values.js'
import type { FlowContext } from './context.js'
import type { NodeExecutorRegistry, NodeExecutorResult } from '../executors/registry.js'
import { resolveValue } from './resolveValue.js'

const MAX_STEPS = 1000

export class FlowRunner {
  private registry: NodeExecutorRegistry

  constructor(registry: NodeExecutorRegistry) {
    this.registry = registry
  }

  /** 获取内部 registry（供 subFlow 执行器递归构造子 runner） */
  getRegistry(): NodeExecutorRegistry {
    return this.registry
  }

  async run(schema: FlowSchema, ctx: FlowContext): Promise<NodeExecutorResult> {
    if (!schema.nodes.length) return

    // 注入 runner 引用到 ctx.env，供 subFlow/forEach 执行器递归使用
    ctx.env.__runner = this

    const nodeMap = new Map<string, FlowNode>(
      schema.nodes.map(n => [n.id, n])
    )

    const edgeMap = new Map<string, FlowEdge[]>()
    for (const edge of schema.edges) {
      const list = edgeMap.get(edge.from) ?? []
      list.push(edge)
      edgeMap.set(edge.from, list)
    }

    // 值解析器（闭包，方便传给执行器）
    const resolve = (val: FlowValue): unknown => resolveValue(val, ctx, nodeMap)

    // 找入口节点：有入边指向的节点集合 → 不在其中的第一个动作节点
    const targetNodeIds = new Set(schema.edges.map(e => e.to))
    const entryNode = schema.nodes.find(
      n => !targetNodeIds.has(n.id) &&
        n.kind !== 'variable' && n.kind !== 'pageVar' && n.kind !== 'eventParam'
    )
    if (!entryNode) return

    let currentId: string | null = entryNode.id
    let steps = 0

    while (currentId && steps < MAX_STEPS) {
      steps++

      const node = nodeMap.get(currentId)
      if (!node) break

      // 查找当前节点的出边（error 边路由也需要）
      const outEdges: FlowEdge[] = edgeMap.get(currentId) ?? []

      // 执行当前节点（带 error 边捕获）
      let branchResult: NodeExecutorResult
      try {
        branchResult = await this.executeNode(node, ctx, resolve)
      } catch (err: unknown) {
        // 查找 error 出边
        const errorEdge = outEdges.find(e => e.branch === 'error')
        if (errorEdge) {
          // 错误信息写入变量，供后续节点使用
          const errInfo = err instanceof Error
            ? { message: err.message, name: err.name }
            : { message: String(err), name: 'Error' }
          ctx.setVariable('local', '__error__', errInfo)
          currentId = errorEdge.to
          continue
        }
        throw err // 没有 error 边 → 保持原有行为（向上抛出）
      }

      // return 节点：提前终止流程，向上层冒泡
      if (branchResult === '__return__') return '__return__'

      // 查找下一个节点（排除 error 边，error 边仅在异常捕获时走）
      if (outEdges.length === 0) {
        currentId = null
      } else if (branchResult === 'true' || branchResult === 'false') {
        // condition 分支
        const edge: FlowEdge | undefined = outEdges.find((e: FlowEdge) => e.branch === branchResult)
        currentId = edge?.to ?? null
      } else {
        // 非分支节点：取第一条非 error 出边
        const normalEdge = outEdges.find(e => e.branch !== 'error')
        currentId = normalEdge?.to ?? null
      }
    }

    if (steps >= MAX_STEPS) {
      throw new Error(`[FlowRunner] 达到最大执行步数 (${MAX_STEPS})，流程可能存在死循环`)
    }
  }

  private async executeNode(
    node: FlowNode,
    ctx: FlowContext,
    resolve: (val: FlowValue) => unknown,
  ): Promise<NodeExecutorResult> {
    // 值节点不参与执行队列
    if (node.kind === 'variable' || node.kind === 'pageVar' || node.kind === 'eventParam') {
      return
    }

    const executor = this.registry.get(node.kind)
    if (!executor) {
      throw new Error(`[FlowRunner] 未注册的节点类型: ${node.kind}`)
    }

    return executor(node, ctx, resolve)
  }
}
