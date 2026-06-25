import type { FlowSchema } from '@/types/foundation/flow/schema.js'
import type { FlowNode } from '@/types/foundation/flow/index.js'
import { NodeKind, CompareOp, LogicOp } from '@/types/foundation/flow/enums.js'
import type { SlotValue, DataRef, Filter, Condition, ConditionGroup } from '@/types/foundation/flow/common.js'
import { isDataRef } from '@/types/foundation/flow/common.js'
import type { CapProxy, IFlowRunner } from '../context/index.js'
import type { IRunnerCtx } from '@/types/foundation/flow/context.js'
import { FrameStack } from '../context/index.js'
import type { NodeExecutor, NodeEvalResult, ExecutorRegistry } from '@/types/foundation/flow/executor.js'

/** Push-Pull 混合调度步数安全阀：单次 `run()` 调用最多执行 1000 步，防止无限循环耗尽宿主线程 */
const MAX_STEPS = 1000

// ── 单步执行结果 ──

/**
 * 单步执行结果 —— stepNode 的一次执行产出。
 *
 * 由 dispatch → executor 返回的 NodeEvalResult 加工而来：
 * cached 命中的产出无需重新调度。
 */
interface StepResult {
  /** executor 产出的键值对（如 dbQuery → { rows, count }） */
  outputs?: Record<string, unknown>
  /** 执行中捕获的错误（onError 存在时不抛给 Runner，交由 onError 子图处理） */
  error?: Error
  /** 控制流下一节点（null = 终止；Source/Compute 无控制流，始终 null） */
  next: FlowNode | null
}

// ── FlowRunner ──

/**
 * FlowRunner —— 声明式流程执行器（v2.1.0）
 *
 * FlowRunner 是 BanvasGL 流程子系统的核心调度器，负责将 `FlowSchema`
 * 按 Push-Pull 混合调度模型解释执行。
 *
 * 在 BanvasGL 分层架构中的位置：
 * `types` → `foundation`（含 flow） → `graph` → `view` → `engine`
 *
 * 架构职责（v2.1.0 统一执行器模型）：
 * - **Runner（本类）**：帧栈管理 / ID→节点映射 / 输出缓存 / 错误恢复 / 步数限制
 *   —— 纯编排外壳，不含任何节点特定的调度逻辑
 * - **Executor（外部注册）**：数据产出 + 下一节点 ID 决策
 *   —— 所有 NodeKind 均通过 `ExecutorRegistry` 分发，Runner 退化为通用执行循环
 *
 * 核心能力：
 * - **Push-Pull 混合调度**：Push 沿控制路径（`next` 字段）推进 control/action 节点；
 *   Pull 沿 `DataRef` 反向递归求值 source/compute 节点
 * - **帧栈与作用域**：每个子图调用（Function/Loop/Parallel）创建新帧，
 *   帧内持有 `in`（只读入参）、`local`（可读写变量）、`nodes`（节点注册表）、
 *   `returnRef`（返回值槽）、`outputCache`（节点输出缓存）
 * - **缓存与惰性求值**：`stepNode` 首次执行后写 `outputCache`，
 *   同一帧内后续引用命中缓存直接返回，避免重复执行
 * - **错误恢复**：Action/Function 节点可绑定 `onError` 子图，
 *   执行失败时进入 onError 子图做补偿（Saga 模式），执行完毕后流程终止
 * - **Filter 求值**：统一 Condition/Loop 的条件判据求值，
 *   支持短路语义（And/Or）和 CompareOp 全集
 *
 * v2.1.0 核心变更：
 * - 统一执行器模型：所有 NodeKind 均通过 executor 注册表分发，
 *   Runner 退化为纯编排外壳
 * - Executor 负责数据产出 + `nextNodeId` 决策；
 *   Runner 负责帧栈管理 / ID→节点映射 / 缓存 / 错误恢复
 * - Control/Function 节点不再硬编码在 Runner，转为独立 executor
 *
 * v2.0.0 核心变更：
 * - 边消解为节点内嵌引用：`next` 字段承载控制流，`DataRef` 承载数据依赖
 * - 节点五分：control / action / source / compute / function
 * - 顶层开放 DAG（显式 entry，next 为空字符串即结束）
 * - 子图可调用闭包（Function/Loop 内嵌 FlowSchema body）
 * - 上下文分层：`FrameRecord.in` / `FrameRecord.local`（帧内变量）
 *   + `FlowRunner.cap`（全局能力代理）
 * - `SlotValue = unknown | DataRef`（槽值：内联字面量或跨节点引用）
 *
 * @typeParam C - 能力代理类型（FrontendCapProxy / BackendCapProxy），
 *   决定 executor 可访问的外部效应（navigate / db / httpClient 等）
 *
 * @example
 * ```typescript
 * // 前端：通过 createClientFlowRunner() 预组装
 * const runner = createClientFlowRunner({
 *   navigate: async (target) => { router.push(target); },
 *   setViewData: (id, key, val) => { /* ... * / },
 *   httpClient: { request: async (...) => ({ status: 200, body: {}, headers: {} }) },
 * });
 * await runner.run(schema, { userId: 'u1' });
 *
 * // 后端：通过 createServerFlowRunner() 预组装
 * const runner = createServerFlowRunner({
 *   db: { query: async (...) => ({ rows: [], count: 0 }), /* ... * / },
 *   httpClient: { request: async (...) => ({ status: 200, body: {}, headers: {} }) },
 * });
 * await runner.run(schema);
 * ```
 */
export class FlowRunner<C extends CapProxy = CapProxy> implements IFlowRunner, IRunnerCtx<C> {
  /**
   * 节点执行器注册表 —— 按 NodeKind 索引的结构体。
   *
   * 每个字段的 node 参数类型由 `NodeForKind` 自动推导，
   * 消除 executor 导出时的 as 断言。前后端 preset 各自填充不同子集。
   */
  readonly executors: ExecutorRegistry<C>

  /** 全局能力代理 —— 整个执行链共享同一引用，executor 通过此字段访问外部效应 */
  readonly cap: C

  // ── IRunnerCtx 字段 ──

  /**
   * 一维帧栈 —— 每条执行路径拥有独立实例。
   *
   * Parallel 分支各自持有独立 FrameStack，避免竞态。
   * 每次 enter/leave 成对调用，保证帧状态不泄漏。
   */
  stack: FrameStack = new FrameStack()

  /**
   * 构造 FlowRunner 实例。
   *
   * 通常不直接 new，而是通过 `createClientFlowRunner()` / `createServerFlowRunner()`
   * 预组装工厂创建。
   *
   * @param executors - 按 NodeKind 索引的执行器注册表
   * @param cap - 全局能力代理（前端或后端）
   */
  constructor(executors: ExecutorRegistry<C>, cap: C) {
    this.executors = executors
    this.cap = cap
  }

  /**
   * 执行顶层 FlowSchema。
   *
   * 入口方法：在当前帧栈上 enter → runGraph → leave。
   * 调用方通过 `cap` 接收副作用结果（如 navigate 切换页面、
   * setViewData 更新视图数据等），不通过返回值。
   *
   * @param graph - 待执行的 FlowSchema（entry + nodes）
   * @param inputs - 顶层入参，进入帧后可通过 `Context` 节点按路径读取
   */
  async run(graph: FlowSchema, inputs: Record<string, unknown> = {}): Promise<void> {
    this.stack.enter(inputs, graph)
    await this.runGraph()
    this.stack.leave()
  }

  /**
   * 执行当前帧的图。
   *
   * 核心执行循环：从 `entry` 节点出发，循环 `stepNode` 推进，
   * 遇到 next 为 null 时终止。步数超过 `MAX_STEPS` 抛错。
   *
   * @param stack - 可选：显式指定帧栈（Parallel 分支传入独立 FrameStack 避免竞态）
   * @returns 帧的返回值（`returnRef.value`，由 Return 节点写入）
   */
  private async runGraph(stack?: FrameStack): Promise<Record<string, unknown>> {
    const s = stack ?? this.stack

    let node: FlowNode | null = s.nodes[s.entry] ?? null

    while (node != null) {
      if (++s.steps > MAX_STEPS) throw new Error('Max steps exceeded')
      const step = await this.stepNode(node, s)
      if (step.error) {
        // Action / Function 节点可能带有 onError 子图
        const errorSchema = (node.slots as Array<{ onError?: FlowSchema }>).find(
          (slot) => slot.onError,
        )?.onError
        if (errorSchema) {
          s.enter({ error: step.error, partialOutputs: step.outputs ?? {} }, errorSchema)
          try {
            await this.runGraph(s)
          } finally {
            s.leave()
          }
        } else {
          throw step.error
        }
      }
      node = step.next
    }
    return s.returnRef.value
  }

  /**
   * 单步流程推进：查缓存 → dispatch 分发 → 求值 → 写缓存。
   *
   * 缓存命中时直接返回历史结果（含 `nextNodeId`），避免重复执行。
   * 缓存未命中时走 `dispatch` → executor 求值，结果写入 `outputCache`。
   *
   * 通过 `switch (node.kind)` 实现 discriminated union 收窄，
   * 每个 case 直接取 registry 对应字段，类型天然匹配，无需 as 断言。
   *
   * @param node - 当前要执行的流程节点
   * @param s - 当前帧栈
   * @returns StepResult（含 outputs / error / next）
   */
  private async stepNode(node: FlowNode, s: FrameStack): Promise<StepResult> {
    const cached = s.getOutput(node.id)
    if (cached) {
      return {
        outputs: cached.outputs,
        error: cached.error,
        next: cached.nextNodeId ? (s.nodes[cached.nextNodeId] ?? null) : null,
      }
    }

    let result: NodeEvalResult
    try {
      result = await this.dispatch(node, s)
    } catch (err) {
      result = {
        error: err instanceof Error ? err : new Error(String(err)),
        nextNodeId: null,
      }
    }

    s.setOutput(node.id, result)
    return {
      outputs: result.outputs,
      error: result.error,
      next: result.nextNodeId ? (s.nodes[result.nextNodeId] ?? null) : null,
    }
  }

  /**
   * switch 分发：按 NodeKind 收窄 node 类型，查 registry 对应字段。
   *
   * 类型安全的分发机制——每个 case 从 `ExecutorRegistry[K]` 取出
   * 对应 `NodeExecutor<NodeForKind<K>, C>`，类型天然匹配，无需 as 断言。
   * default 分支由 TypeScript never 类型保证穷尽检查。
   *
   * @param node - 待执行的流程节点
   * @param s - 当前帧栈
   * @returns executor 产出的 NodeEvalResult
   */
  private async dispatch(node: FlowNode, s: FrameStack): Promise<NodeEvalResult> {
    switch (node.kind) {
      // ── Source ──
      case NodeKind.Literal:
        return this.execSource(this.executors[NodeKind.Literal], node)
      case NodeKind.Context:
        return this.execSource(this.executors[NodeKind.Context], node)

      // ── Compute ──
      case NodeKind.Math:
        return this.exec(this.executors[NodeKind.Math], node, s)
      case NodeKind.Compare:
        return this.exec(this.executors[NodeKind.Compare], node, s)
      case NodeKind.Logic:
        return this.exec(this.executors[NodeKind.Logic], node, s)
      case NodeKind.Concat:
        return this.exec(this.executors[NodeKind.Concat], node, s)
      case NodeKind.Format:
        return this.exec(this.executors[NodeKind.Format], node, s)
      case NodeKind.Get:
        return this.exec(this.executors[NodeKind.Get], node, s)

      // ── Action（共享）──
      case NodeKind.SetVariable:
        return this.exec(this.executors[NodeKind.SetVariable], node, s)

      // ── Action（前端）──
      case NodeKind.SetViewData:
        return this.exec(this.executors[NodeKind.SetViewData], node, s)
      case NodeKind.SetViewVisible:
        return this.exec(this.executors[NodeKind.SetViewVisible], node, s)
      case NodeKind.PlayAnimation:
        return this.exec(this.executors[NodeKind.PlayAnimation], node, s)
      case NodeKind.Navigate:
        return this.exec(this.executors[NodeKind.Navigate], node, s)
      case NodeKind.CloudFunction:
        return this.exec(this.executors[NodeKind.CloudFunction], node, s)

      // ── Action（后端）──
      case NodeKind.HttpRequest:
        return this.exec(this.executors[NodeKind.HttpRequest], node, s)
      case NodeKind.DbQuery:
        return this.exec(this.executors[NodeKind.DbQuery], node, s)
      case NodeKind.DbInsert:
        return this.exec(this.executors[NodeKind.DbInsert], node, s)
      case NodeKind.DbUpdate:
        return this.exec(this.executors[NodeKind.DbUpdate], node, s)
      case NodeKind.DbDelete:
        return this.exec(this.executors[NodeKind.DbDelete], node, s)

      // ── Control ──
      case NodeKind.Condition:
        return this.exec(this.executors[NodeKind.Condition], node, s)
      case NodeKind.Loop:
        return this.exec(this.executors[NodeKind.Loop], node, s)
      case NodeKind.Parallel:
        return this.exec(this.executors[NodeKind.Parallel], node, s)
      case NodeKind.Return:
        return this.exec(this.executors[NodeKind.Return], node, s)

      // ── Function ──
      case NodeKind.Function:
        return this.exec(this.executors[NodeKind.Function], node, s)

      default: {
        const _exhaustive: never = node
        throw new Error('Unhandled node kind: ' + (_exhaustive as FlowNode).kind)
      }
    }
  }

  /**
   * 执行 Source 节点（无需 pullSlots 解析输入）。
   *
   * Source 节点的值完全来自自身（字面量或上下文路径），
   * 不存在上游输入，因此直接调 executor，不执行 pullSlots。
   *
   * @param ex - Source 节点执行器
   * @param node - Source 节点（Literal / Context）
   * @returns NodeEvalResult
   */
  private async execSource<N extends FlowNode>(
    ex: NodeExecutor<N, C> | undefined,
    node: N,
  ): Promise<NodeEvalResult> {
    if (!ex) throw new Error(`Executor not registered for ${node.kind}`)
    return ex(node, {}, this)
  }

  /**
   * 执行普通节点：先 pullSlots 解析输入，再调用 executor。
   *
   * Pull 阶段沿 DataRef 递归求值上游节点的输出，将 `SlotValue` 解析为具体值。
   * 解析完成后将具体值传给 executor，executor 产出 `NodeEvalResult`。
   *
   * @param ex - 节点执行器
   * @param node - 待执行的流程节点
   * @param s - 当前帧栈
   * @returns NodeEvalResult
   */
  private async exec<N extends FlowNode>(
    ex: NodeExecutor<N, C> | undefined,
    node: N,
    s: FrameStack,
  ): Promise<NodeEvalResult> {
    if (!ex) throw new Error(`Executor not registered for ${node.kind}`)
    const inputs = await this.pullSlots(s, node)
    return ex(node, inputs, this)
  }

  // ═══════════════════════════════════════════════════════════
  // DataRef 解析 / 子图执行 / Filter 求值
  // ═══════════════════════════════════════════════════════════

  /**
   * 解析槽值：DataRef → 递归拉取上游输出，字面量 → 直接返回。
   *
   * 遇到 DataRef 时递归调用 stepNode 求值上游节点（写缓存），
   * 然后从上游 outputs 中取对应 field 的值。字面量直接透传。
   *
   * @param slot - 槽值（内联字面量或 DataRef 引用）
   * @param stack - 可选的帧栈（默认当前帧栈）
   * @returns 解析后的具体值
   */
  private async pull(slot: SlotValue, stack?: FrameStack): Promise<unknown> {
    const s = stack ?? this.stack
    if (!isDataRef(slot)) return slot
    const ref = slot as DataRef
    const upstream = s.nodes[ref.nodeId]
    if (!upstream) throw new Error('DataRef target not found: ' + ref.nodeId)
    const step = await this.stepNode(upstream, s)
    if (step.error) throw step.error
    return (step.outputs ?? {})[ref.field]
  }

  /**
   * 解析节点所有 slot 的输入，返回具体值映射。
   *
   * 遍历 `node.slots` 中每个 slot 的 `input` 字段，逐一 `pull` 解析，
   * 产出 `Record<string, unknown>` 传给 executor。
   *
   * @param stack - 当前帧栈
   * @param node - 待解析输入的节点
   * @returns 已解析的输入键值对
   */
  private async pullSlots(stack: FrameStack, node: FlowNode): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {}
    for (const s of node.slots ?? []) {
      const input: Record<string, SlotValue> = s.input ?? {}
      for (const [name, slot] of Object.entries(input)) {
        result[name] = await this.pull(slot, stack)
      }
    }
    return result
  }

  /**
   * 在指定帧栈（默认当前）上 enter → runGraph → leave，返回 `returnRef.value`。
   *
   * 用于 Function / Loop / Parallel 等需要创建新作用域的场景。
   * 调用方传入子图的 FlowSchema 和入参，Runner 在新帧中执行子图，
   * 执行完毕后自动弹出帧并返回 Return 节点写入的值。
   *
   * @param schema - 子图 FlowSchema
   * @param inputs - 子图入参（进入新帧后可通过 `Context` 节点读取）
   * @param stack - 可选的帧栈（默认当前帧栈，Parallel 分支传入独立 FrameStack）
   * @returns 子图返回值（Return 节点写入 `returnRef.value`）
   */
  async runSubGraph(
    schema: FlowSchema,
    inputs: Record<string, unknown>,
    stack?: FrameStack,
  ): Promise<Record<string, unknown>> {
    const s = stack ?? this.stack
    s.enter(inputs, schema)
    return this.runGraph(s).finally(() => s.leave())
  }

  // ── Filter 求值（供 control executor 调用）──

  /**
   * 求值 Filter（含短路语义），供 condition / loop executor 调用。
   *
   * Filter 是 `Condition | ConditionGroup` 的联合类型：
   * - `Condition { left, op, right }`：比较两个 SlotValue
   * - `ConditionGroup { op, conditions }`：And/Or/Not 逻辑组合，支持短路求值
   *
   * @param filter - 待求值的过滤条件
   * @returns 条件是否成立
   */
  async evaluateFilter(filter: Filter): Promise<boolean> {
    return evaluateFilterImpl(filter, (slot) => this.pull(slot))
  }
}

// ── Filter 求值实现（纯函数，模块级，零依赖）──

/**
 * 递归求值 Filter，支持 Condition / ConditionGroup 嵌套。
 *
 * `resolve` 回调将 SlotValue 解析为具体值（DataRef → pull 上游输出，字面量 → 直接返回）。
 * Condition 走 compareEval，ConditionGroup 走 logicEval（含短路语义）。
 *
 * @param filter - 待求值的过滤条件
 * @param resolve - SlotValue 解析器（通常绑定到 Runner.pull）
 * @returns 条件是否成立
 */
async function evaluateFilterImpl(
  filter: Filter,
  resolve: (slot: SlotValue) => Promise<unknown>,
): Promise<boolean> {
  if ('left' in filter && 'right' in filter) {
    const cond = filter as Condition
    return compareEval(await resolve(cond.left), cond.op, await resolve(cond.right))
  }
  if ('conditions' in filter) {
    const group = filter as ConditionGroup
    return logicEval(group.op, group.conditions, resolve)
  }
  return false
}

/**
 * 逻辑运算求值（含短路语义）。
 *
 * - And：从左到右逐一求值，首个 false 立即返回 false
 * - Or：从左到右逐一求值，首个 true 立即返回 true
 * - Not：对唯一条件取反
 *
 * @param op - 逻辑运算符
 * @param conditions - 子条件列表
 * @param resolve - SlotValue 解析器
 * @returns 逻辑运算结果
 */
async function logicEval(
  op: LogicOp,
  conditions: Filter[],
  resolve: (slot: SlotValue) => Promise<unknown>,
): Promise<boolean> {
  switch (op) {
    case LogicOp.And: {
      for (const c of conditions) if (!(await evaluateFilterImpl(c, resolve))) return false
      return true
    }
    case LogicOp.Or: {
      for (const c of conditions) if (await evaluateFilterImpl(c, resolve)) return true
      return false
    }
    case LogicOp.Not:
      return !(await evaluateFilterImpl(conditions[0], resolve))
    default:
      return false
  }
}

/**
 * 比较运算求值。
 *
 * 支持八种比较操作：Eq / Neq / Gt / Gte / Lt / Lte / Contains。
 * 数值用 `>` / `<` 比较，字符串用宽松相等（`==`），Contains 转字符串后 includes。
 *
 * @param left - 左操作数（已解析为具体值）
 * @param op - 比较运算符
 * @param right - 右操作数（已解析为具体值）
 * @returns 比较结果
 */
function compareEval(left: unknown, op: CompareOp, right: unknown): boolean {
  switch (op) {
    case CompareOp.Eq:
      return (left as any) == (right as any)
    case CompareOp.Neq:
      return (left as any) != (right as any)
    case CompareOp.Gt:
      return (left as any) > (right as any)
    case CompareOp.Gte:
      return (left as any) >= (right as any)
    case CompareOp.Lt:
      return (left as any) < (right as any)
    case CompareOp.Lte:
      return (left as any) <= (right as any)
    case CompareOp.Contains:
      return String(left).includes(String(right))
    default:
      return false
  }
}
