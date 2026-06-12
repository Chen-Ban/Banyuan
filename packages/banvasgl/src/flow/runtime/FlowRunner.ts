/**
 * FlowRunner —— Push-Pull 混合调度器
 *
 * Push 沿 ControlEdge 推进 control/action 节点。
 * Pull 沿 DataEdge 反向递归求值 source/compute 子树。
 * 顶层图为开放 DAG，子图为可调用闭包。
 */

import type { FlowSchema, FlowSubSchema, FlowNode, FlowControlEdge, FlowDataEdge } from '../types/schema.js'
import type { FlowSlot } from '../types/values.js'
import type { FlowControlNode, FlowForEachNode, FlowParallelNode, FlowSubFlowNode } from '../types/nodes/control.js'
import type { FlowActionNode } from '../types/nodes/action.js'
import type { FlowSourceNode } from '../types/nodes/source.js'
import type { FlowComputeNode } from '../types/nodes/compute.js'
import type { ContextFrame, MountContext } from './context.js'
import type { NodeExecutorRegistry, NodeExecutor, NodeExecResult } from '../executors/registry.js'
import { contextGet } from './context.js'

const MAX_STEPS = 1000

type OutputCache = Map<string, Record<string, unknown>>
type GraphHandle = {
  nodes: Record<string, FlowNode>
  controlEdges: FlowControlEdge[]
  dataEdges: FlowDataEdge[]
}

export class FlowRunner {
  private registry: NodeExecutorRegistry

  constructor(registry: NodeExecutorRegistry) {
    this.registry = registry
  }

  /** 执行顶层流程 */
  async run(graph: FlowSchema, mountCtx: MountContext): Promise<void> {
    const frame = ContextFrame.fromMount(mountCtx)
    await this.runGraph(graph, frame)
  }

  // ═══════════════════════════════════════════════════════════════
  // 内部方法
  // ═══════════════════════════════════════════════════════════════

  private async runGraph(
    graph: FlowSchema | FlowSubSchema,
    frame: ContextFrame,
  ): Promise<Record<string, unknown>> {
    const isSubgraph = 'subEntry' in graph
    const entryId = isSubgraph ? graph.subEntry : graph.entry
    const exitId = isSubgraph ? graph.subExit : null

    let node: FlowNode | null = graph.nodes[entryId]
    if (!node) return {}

    let steps = 0
    const cache: OutputCache = new Map()

    while (node != null) {
      if (++steps > MAX_STEPS) throw new Error(`[FlowRunner] Max steps (${MAX_STEPS}) exceeded`)

      switch (node.category) {
        case 'control':
          node = await this.executeControl(node as FlowControlNode, graph, frame, cache)
          break
        case 'action':
          await this.executeAction(node as FlowActionNode, graph, frame, cache)
          node = this.nextByControlEdge(node, graph)
          break
        default:
          // source/compute 不应被 Push 走到
          throw new Error(`[FlowRunner] Unexpected node category on control path: ${node.category}`)
      }

      if (isSubgraph && node?.id === exitId) {
        return this.collectExitOutputs(graph as FlowSubSchema, cache)
      }
      if (!isSubgraph && node == null) return {}
    }
    return {}
  }

  // ── Control ──

  private async executeControl(
    node: FlowControlNode,
    graph: GraphHandle,
    frame: ContextFrame,
    cache: OutputCache,
  ): Promise<FlowNode | null> {
    switch (node.kind) {
      case 'condition': {
        for (const c of node.cases) {
          if (await this.resolveSlot(c.slot, graph, cache) === true) {
            return this.followControlEdge(node, graph, c.label)
          }
        }
        return this.followControlEdge(node, graph, node.default ?? 'default')
      }

      case 'while': {
        while (await this.resolveSlot(node.condition, graph, cache) === true) {
          await this.runGraph(node.body, frame.pushScope({}))
        }
        return this.followControlEdge(node, graph)
      }

      case 'forEach': {
        const raw = await this.resolveSlot(node.collection, graph, cache)
        const items = Array.isArray(raw) ? raw : []
        let idx = 0
        for (const item of items) {
          const scope: Record<string, unknown> = { [node.itemVar ?? 'item']: item }
          if (node.indexVar) scope[node.indexVar] = idx
          await this.runGraph(node.body, frame.pushScope(scope))
          idx++
        }
        return this.followControlEdge(node, graph)
      }

      case 'parallel': {
        const results = await this.executeParallel(node, graph, frame, cache)
        cache.set(node.id, { result: results })
        return this.followControlEdge(node, graph)
      }

      case 'subFlow': {
        const subSchema = this.loadSubFlow(node.subFlowId)
        const boundInputs = await this.resolveSlots(node.inputs, graph, cache)
        const subFrame = frame.pushIsolatedScope({
          in: boundInputs,
          state: { view: {}, page: {}, app: {}, flow: {} },
        })
        const outputs = await this.runGraph(subSchema, subFrame)
        cache.set(node.id, outputs)
        return this.followControlEdge(node, graph)
      }

      default:
        throw new Error(`[FlowRunner] Unknown control kind: ${(node as any).kind}`)
    }
  }

  // ── Action ──

  private async executeAction(
    node: FlowActionNode,
    graph: GraphHandle,
    frame: ContextFrame,
    cache: OutputCache,
  ): Promise<void> {
    const executor = this.registry.get(node.kind)
    if (!executor) throw new Error(`[FlowRunner] Unknown action kind: ${node.kind}`)

    const inputs = await this.resolveSlots(this.getInputSlots(node), graph, cache)
    const result = await executor.execute(node, inputs, frame.in, frame.state, frame.cap)

    if (result.error) {
      if (node.onError) {
        const errFrame = frame.pushScope({
          in: { error: result.error, partialOutputs: result.outputs ?? {} },
        })
        await this.runGraph(node.onError, errFrame)
      } else {
        throw result.error
      }
      return // onError 是补偿，流程终止
    }

    if (result.outputs) cache.set(node.id, result.outputs)
  }

  // ── Parallel ──

  private async executeParallel(
    node: FlowParallelNode,
    graph: GraphHandle,
    frame: ContextFrame,
    cache: OutputCache,
  ): Promise<unknown> {
    const { mode, branches } = node
    const makeFrame = (mode === 'all' || mode === 'allSettled')
      ? () => frame.snapshot()
      : () => frame

    const tasks = branches.map(b => this.runGraph(b, makeFrame()))

    switch (mode) {
      case 'all':
        return Promise.all(tasks)
      case 'allSettled': {
        const settled = await Promise.allSettled(tasks)
        return settled.map(r => ({
          status: r.status,
          value: r.status === 'fulfilled' ? r.value : undefined,
          reason: r.status === 'rejected' ? r.reason : undefined,
        }))
      }
      case 'race':
        return Promise.race(tasks)
      case 'any':
        return Promise.any(tasks)
    }
  }

  // ── Pull: 沿 DataEdge 递归求值 ──

  async resolveSlot(
    slot: FlowSlot,
    graph: GraphHandle,
    cache: OutputCache,
    caller?: { nodeId: string; slotName: string },
  ): Promise<unknown> {
    if (!caller) return slot

    const dataEdge = graph.dataEdges.find(
      e => e.toNode === caller.nodeId && e.toSlot === caller.slotName,
    )
    if (!dataEdge) return slot

    const upstream = graph.nodes[dataEdge.fromNode]
    if (!upstream) throw new Error(`[FlowRunner] Node not found: ${dataEdge.fromNode}`)

    switch (upstream.category) {
      case 'source': {
        const src = upstream as FlowSourceNode
        if (src.from === 'literal') return src.value
        return contextGet(src.path, { in: {}, state: {} } as any)
      }

      case 'compute': {
        if (cache.has(upstream.id)) return cache.get(upstream.id)!['value']
        return this.executeCompute(upstream as FlowComputeNode, graph, cache)
      }

      case 'action': {
        const outputs = cache.get(upstream.id)
        if (!outputs) throw new Error(`[FlowRunner] Action not yet executed: ${upstream.id}`)
        return outputs[dataEdge.fromPort]
      }

      default:
        throw new Error(`[FlowRunner] Cannot Pull from node category: ${upstream.category}`)
    }
  }

  // ── Compute ──

  private async executeCompute(
    node: FlowComputeNode,
    graph: GraphHandle,
    cache: OutputCache,
  ): Promise<unknown> {
    if (cache.has(node.id)) return cache.get(node.id)!['value']

    const executor = this.registry.get(node.kind)
    if (!executor) throw new Error(`[FlowRunner] Unknown compute kind: ${node.kind}`)

    const inputs = await this.resolveSlots(this.getInputSlots(node), graph, cache)
    // compute 不可见 in/state/cap —— 纯函数
    const result = await executor.execute(node, inputs, {}, {} as any, {} as any)

    if (result.error) throw result.error
    cache.set(node.id, result.outputs ?? {})
    return result.outputs?.['value']
  }

  // ── Helpers ──

  private nextByControlEdge(node: FlowNode, graph: GraphHandle): FlowNode | null {
    const edge = graph.controlEdges.find(e => e.from === node.id)
    return edge ? (graph.nodes[edge.to] ?? null) : null
  }

  private followControlEdge(node: FlowNode, graph: GraphHandle, branch?: string): FlowNode | null {
    const edges = graph.controlEdges.filter(e => e.from === node.id)
    if (edges.length === 0) return null
    if (branch != null) {
      const match = edges.find(e => e.branch === branch)
      return match ? (graph.nodes[match.to] ?? null) : null
    }
    return graph.nodes[edges[0].to] ?? null
  }

  private collectExitOutputs(sub: FlowSubSchema, cache: OutputCache): Record<string, unknown> {
    const outputs: Record<string, unknown> = {}
    for (const e of sub.dataEdges) {
      if (e.toNode === sub.subExit) {
        const upstreamOut = cache.get(e.fromNode)
        if (upstreamOut && e.fromPort in upstreamOut) {
          outputs[e.fromPort] = upstreamOut[e.fromPort]
        }
      }
    }
    return outputs
  }

  private async resolveSlots(
    slots: Record<string, FlowSlot>,
    graph: GraphHandle,
    cache: OutputCache,
  ): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {}
    for (const [name, slot] of Object.entries(slots)) {
      result[name] = await this.resolveSlot(slot, graph, cache, { nodeId: '', slotName: name })
    }
    return result
  }

  private getInputSlots(_node: FlowNode): Record<string, FlowSlot> {
    // NodeKindDescriptor 提供此映射。此处为简化实现，执行器自行从 node 提取。
    // 在完整实现中由 NODE_KIND_DESCRIPTORS[node.kind]?.deriveInputSlots(node) 提供。
    const node = _node as any
    const slots: Record<string, FlowSlot> = {}
    for (const [key, val] of Object.entries(node)) {
      if (key !== 'id' && key !== 'category' && key !== 'kind'
        && key !== 'onError' && key !== 'body' && key !== 'branches'
        && key !== 'cases' && key !== 'default'
        && key !== 'itemVar' && key !== 'indexVar'
        && key !== 'subFlowId' && key !== 'mode'
        && key !== 'from' && key !== 'method' && key !== 'op'
        && key !== 'target' && key !== 'collection' && key !== 'template'
        && typeof val !== 'object' && typeof val !== 'function') {
        continue
      }
      // 简单启发式：object 类型字段视为可能的插槽
      if (val != null && typeof val === 'object' && !Array.isArray(val)) {
        // Record<string, FlowSlot> 或 FlowSlot
        if ('a' in (val as any) || 'b' in (val as any) || 'value' in (val as any)
          || 'parts' in (val as any) || 'operands' in (val as any)
          || 'object' in (val as any)) {
          Object.assign(slots, val)
        } else {
          slots[key] = val as FlowSlot
        }
      }
    }
    return slots
  }

  private loadSubFlow(_subFlowId: string): FlowSubSchema {
    // TODO: 从物料系统加载
    throw new Error('[FlowRunner] loadSubFlow not implemented — need material system integration')
  }
}
