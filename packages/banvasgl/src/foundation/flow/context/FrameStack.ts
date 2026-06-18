/**
 * FrameStack —— 一维帧栈
 *
 * 每条执行路径拥有独立的一维调用栈，每条路径对应一个 FrameStack 实例。
 * Parallel 分支各自持有独立 FrameStack，避免竞态。
 *
 * FrameRecord 封装数据层 + 执行态元数据：
 *   in          — 子图调用的只读入参（enter 时传入，帧内只读）
 *   local       — 帧内可读写临时变量（setVariable 写入，enter 初始化为 {}，leave 随帧销毁）
 *   nodes       — 当前子图的节点注册表（enter 由 schema.nodes 设置）
 *   entry       — 当前子图的入口节点 ID（enter 由 schema.entry 设置）
 *   returnRef   — 当前帧的返回值槽（enter 初始化为 {}，Return 节点写入）
 *   steps       — 全局步数计数器（enter 继承父帧，全局累计防无限执行）
 *   outputCache — 节点输出缓存（stepNode 首次写入，帧内后续命中直接返回，leave 随帧销毁）
 *
 * enter(inputs, schema) — 图帧压栈：由 schema 构建 nodes/entry/returnRef，inputs 作为帧入参
 * leave()                — 弹出并自动恢复父帧状态（将子帧 steps 合并回父帧）
 */

import type { FlowSchema } from '@/types/foundation/flow/schema.js'
import type { IFrameStack } from '@/types/foundation/flow/context.js'
import type { FlowNode } from '@/types/foundation/flow/index.js'
import type { NodeEvalResult } from '@/types/foundation/flow/executor.js'

// ── 内部类型 ──

/**
 * 帧栈存储单元：数据层 + 执行态元数据。
 *
 * 每个 enter() 调用创建一个新的 FrameRecord 压入栈顶。
 * leave() 弹出时随帧销毁，steps 合并回父帧。
 */
interface FrameRecord {
  /** 只读入参（子图调用时传入，帧内只读） */
  in: Readonly<Record<string, unknown>>
  /** 可读写临时变量（setVariable 写入，enter 初始化为 {}） */
  local: Record<string, unknown>
  /** 当前子图的节点注册表（key = nodeId） */
  nodes: Record<string, FlowNode>
  /** 当前子图的入口节点 ID */
  entry: string
  /** 返回值槽（初始化为 {}，Return 节点写入） */
  returnRef: { value: Record<string, unknown> }
  /** 全局步数计数器（继承父帧，全局累计） */
  steps: number
  /** 节点输出缓存（首次 stepNode 写入，帧内后续命中直接返回） */
  outputCache: Map<string, NodeEvalResult>
}

// ── FrameStack ──

/**
 * FrameStack —— 一维帧栈实现。
 *
 * 每个 FlowRunner 实例持有一个 FrameStack，管理嵌套子图调用的作用域。
 * Parallel 分支各自创建独立 FrameStack 避免竞态。
 *
 * 帧栈访问通过 `top` getter 代理到栈顶 FrameRecord，外部代码通过
 * `stack.in` / `stack.local` / `stack.nodes` 等属性透明访问当前帧。
 *
 * @example
 * ```typescript
 * const stack = new FrameStack();
 * stack.enter({ userId: 'u1' }, schema);  // 压栈
 * // ... 执行 schema ...
 * stack.leave();  // 弹出，steps 合并回父帧
 * ```
 */
export class FrameStack implements IFrameStack {
  private frames: FrameRecord[]

  constructor() {
    this.frames = []
  }

  // ── 栈顶快捷访问 ──

  /**
   * 获取栈顶帧记录。
   *
   * 所有公开属性的 getter/setter 都代理到此 top 对象。
   * 栈为空时抛错——调用方需确保在 enter() 之后访问。
   */
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
      in: { ...inputs },
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

  getOutput(nodeId: string): NodeEvalResult | undefined {
    return this.top.outputCache.get(nodeId)
  }

  setOutput(nodeId: string, result: NodeEvalResult): void {
    this.top.outputCache.set(nodeId, result)
  }
}
