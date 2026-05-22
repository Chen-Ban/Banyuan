/**
 * FlowRunner —— FlowSchema 核心调度器
 *
 * kind-agnostic 设计：不关心具体有哪些节点类型，
 * 通过 NodeExecutorRegistry 查找对应的执行器。
 * 新增节点类型只需注册新执行器，无需修改本文件。
 *
 * 执行模型：
 * 1. 建图（nodes → nodeMap, edges → edgeMap）
 * 2. 从入口节点出发（无入边的第一个动作节点）
 * 3. 按边顺序调用执行器
 * 4. condition 节点根据返回的 'true'/'false' 选择分支边
 * 5. MAX_STEPS 防死循环
 */

import type { FlowSchema, FlowNode, FlowEdge } from '../types/schema.js'
import type { FlowValue } from '../types/values.js'
import type { FlowContext } from './context.js'
import type { NodeExecutorRegistry } from '../executors/registry.js'
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

  async run(schema: FlowSchema, ctx: FlowContext): Promise<void> {
    if (!schema.nodes.length) return

    // 注入 runner 引用到 ctx.env，供 subFlow 执行器递归使用
    if (!ctx.env.__runner) ctx.env.__runner = this

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

      // 执行当前节点
      const branchResult = await this.executeNode(node, ctx, resolve)

      // 查找下一个节点
      const outEdges: FlowEdge[] = edgeMap.get(currentId) ?? []
      if (outEdges.length === 0) {
        currentId = null
      } else if (branchResult === 'true' || branchResult === 'false') {
        // condition 分支
        const edge: FlowEdge | undefined = outEdges.find((e: FlowEdge) => e.branch === branchResult)
        currentId = edge?.to ?? null
      } else {
        // 非分支节点：取第一条出边
        currentId = outEdges[0].to
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
  ): Promise<'true' | 'false' | void> {
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
