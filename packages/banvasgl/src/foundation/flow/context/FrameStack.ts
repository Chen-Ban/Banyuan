/**
 * FrameStack —— 一维帧栈
 *
 * 每条执行路径拥有独立的一维调用栈，每条路径对应一个 FrameStack 实例。
 * Parallel 分支各自持有独立 FrameStack，避免竞态。
 *
 * FrameRecord 封装数据层 + 执行态元数据：
 *   in          — 子图调用的只读入参（enter 时传入，帧内只读）
 *   local       — 帧内可读写临时变量（setVariable 写入，enter 初始化为 {}，leave 随帧销毁）
 *   nodes       — 当前子图的节点注册表（enter 由 schema 设置）
 *   entry       — 当前子图的入口节点 ID（enter 由 schema 设置）
 *   returnRef   — 当前帧的返回值槽（enter 初始化为 {}，Return 节点写入）
 *   steps       — 全局步数计数器（enter 继承父帧，全局累计防无限执行）
 *   outputCache — 节点输出缓存（stepNode 首次写入，帧内后续命中直接返回，leave 随帧销毁）
 *
 * enter(inputs, schema) — 图帧压栈：由 schema 构建 nodes/entry/returnRef，inputs 作为帧入参
 * leave()                — 弹出并自动恢复父帧状态
 */

import type { FlowSchema } from '@/types/foundation/flow/schema.js'
import type { IFrameStack } from '@/types/foundation/flow/context.js'
import type { FlowNode } from '@/types/foundation/flow/index.js'
import type { EvalResult } from '../executors/types.js'

// ── 内部类型 ──

/** 帧栈存储单元：数据层 + 执行态元数据 */
interface FrameRecord {
  in: Readonly<Record<string, unknown>>
  local: Record<string, unknown>
  nodes: Record<string, FlowNode>
  entry: string
  returnRef: { value: Record<string, unknown> }
  steps: number
  outputCache: Map<string, EvalResult>
}

// ── FrameStack ──

export class FrameStack implements IFrameStack {
  private frames: FrameRecord[]

  constructor() {
    this.frames = []
  }

  // ── 栈顶快捷访问 ──

  private get top(): FrameRecord {
    if (this.frames.length === 0) throw new Error('FrameStack: no frames — call enter() first')
    return this.frames[this.frames.length - 1]
  }

  get in(): Readonly<Record<string, unknown>> {
    return this.top.in
  }

  get local(): Record<string, unknown> {
    return this.top.local
  }

  get nodes(): Record<string, FlowNode> {
    return this.top.nodes
  }

  get entry(): string {
    return this.top.entry
  }

  get returnRef(): { value: Record<string, unknown> } {
    return this.top.returnRef
  }

  get steps(): number {
    return this.top.steps
  }

  set steps(v: number) {
    this.top.steps = v
  }

  // ── 帧管理 ──

  /**
   * 压入图帧：由 FlowSchema 构建执行上下文。
   * nodes ← schema.nodes / entry ← schema.entry / returnRef 初始化为 {}。
   * local 初始化为 {}，steps 从父帧继承（全局累计，不归零）。
   */
  enter(inputs: Readonly<Record<string, unknown>>, schema: FlowSchema): void {
    const parentSteps = this.frames.length > 0 ? this.top.steps : 0
    const rec: FrameRecord = {
      in: inputs,
      local: {},
      nodes: schema.nodes,
      entry: schema.entry,
      returnRef: { value: {} },
      steps: parentSteps,
      outputCache: new Map(),
    }
    this.frames.push(rec)
  }

  /** 弹出当前帧，将子帧 steps 合并回父帧（全局累计）。 */
  leave(): void {
    const popped = this.frames.pop()!
    if (this.frames.length > 0 && popped.steps > this.top.steps) {
      this.top.steps = popped.steps
    }
  }

  // ── 输出缓存 ──

  getOutput(nodeId: string): EvalResult | undefined {
    return this.top.outputCache.get(nodeId)
  }

  setOutput(nodeId: string, result: EvalResult): void {
    this.top.outputCache.set(nodeId, result)
  }
}
