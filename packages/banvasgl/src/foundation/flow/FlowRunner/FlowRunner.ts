import type { FlowSchema } from "@/types/foundation/flow/schema.js";
import type { FlowNode } from "@/types/foundation/flow/index.js";
import { NodeKind, NodeCategory, ParallelMode, LogicOp } from "@/types/foundation/flow/enums.js";
import type { FlowActionNode } from "@/types/foundation/flow/nodes/action.js";
import type {
  Filter,
  Condition,
  ConditionGroup,
  SlotValue,
  DataRef,
} from "@/types/foundation/flow/common.js";
import { isDataRef } from "@/types/foundation/flow/common.js";
import type { CapProxy, IFlowRunner } from "../context/index.js";
import type { IRunnerCtx } from "@/types/foundation/flow/context.js";
import { FrameStack } from "../context/index.js";
import type { NodeEvaluator, EvalResult } from "../executors/types.js";
import { compareEval } from "./FlowRunnerUtils.js";

const MAX_STEPS = 1000;

// ── 单步执行结果 ──

interface StepResult {
  outputs?: Record<string, unknown>
  error?: Error
  /** 控制流下一节点（null = 终止；Source/Compute 无控制流，始终 null） */
  next: FlowNode | null
}

// ── FlowRunner ──

export class FlowRunner implements IFlowRunner, IRunnerCtx {
  readonly executors: Record<string, NodeEvaluator>;
  readonly cap: CapProxy;

  // ── IRunnerCtx 字段 ──
  stack: FrameStack = new FrameStack();

  constructor(executors: Record<string, NodeEvaluator>, cap: CapProxy) {
    this.executors = executors;
    this.cap = cap;
  }

  /**
   * 执行顶层 FlowSchema。
   */
  async run(graph: FlowSchema): Promise<void> {
    this.stack.enter({}, graph);
    await this.runGraph();
    this.stack.leave();
  }

  /**
   * 执行当前帧的图。
   *
   * @param stack 可选：显式指定帧栈（Parallel 分支传入独立 FrameStack 避免竞态）
   */
  private async runGraph(
    stack?: FrameStack,
  ): Promise<Record<string, unknown>> {
    const s = stack ?? this.stack;

    let node: FlowNode | null = s.nodes[s.entry] ?? null;

    while (node != null) {
      if (++s.steps > MAX_STEPS) throw new Error("Max steps exceeded");
      const step = await this.stepNode(node, s);
      if (step.error) {
        // 仅 Action 节点可能产生可恢复 error（Source/Compute 不在控制路径上）
        const act = node as FlowActionNode;
        const errorSchema = act.slots.find((slot) => slot.onError)?.onError;
        if (errorSchema) {
          s.enter(
            { error: step.error, partialOutputs: step.outputs ?? {} },
            errorSchema,
          );
          try {
            await this.runGraph(s);
          } finally {
            s.leave();
          }
        } else {
          throw step.error;
        }
      }
      node = step.next;
    }
    return s.returnRef.value;
  }

  /**
   * 单步流程推进：按 kind 求值，返回 StepResult。
   *
   * 两种调用路径：
   *   - 控制路径（runGraph）：消费 next + error（onError 处理）
   *   - 数据路径（pull / DataRef 解析）：消费 outputs / error（直接 throw）
   */
  private async stepNode(
    node: FlowNode,
    s: FrameStack,
  ): Promise<StepResult> {
    switch (node.kind) {
      // ── Control ──
      case NodeKind.Condition: {
        for (const slot of node.slots) {
          if (await this.evaluateFilter(s, slot.filter)) {
            return { next: s.nodes[slot.next] ?? null };
          }
        }
        return { next: null };
      }
      case NodeKind.Loop: {
        const slot = node.slots[0];
        while (await this.evaluateFilter(s, slot.filter)) {
          s.enter({}, slot.body);
          await this.runGraph(s);
          s.leave();
        }
        return { next: s.nodes[slot.next] ?? null };
      }
      case NodeKind.Parallel: {
        const bodies = node.slots[0].body;
        const mode = node.slots[0].mode;
        const tasks = bodies.map((b) => {
          const branchStack = new FrameStack();
          branchStack.enter({}, b);
          return this.runGraph(branchStack);
        });
        switch (mode) {
          case ParallelMode.All:
            await Promise.all(tasks);
            break;
          case ParallelMode.AllSettled:
            await Promise.allSettled(tasks);
            break;
          case ParallelMode.Race:
            await Promise.race(tasks);
            break;
          case ParallelMode.Any:
            await (Promise as any).any(tasks);
            break;
        }
        return { next: s.nodes[node.slots[0].next] ?? null };
      }
      case NodeKind.Return: {
        const values = await this.pullSlots(s, node);
        s.returnRef.value = values;
        return { next: null };
      }

      // ── Function ──
      case NodeKind.Function: {
        const subSchema = node.slots[0].body;
        const inputs = await this.pullSlots(s, node);
        s.enter(inputs, subSchema);
        await this.runGraph(s);
        s.leave();
        return { next: s.nodes[node.slots[0].next] ?? null };
      }

      // ── 数据节点（Source / Compute / Action） ──
      default: {
        const cached = s.getOutput(node.id);
        if (cached) {
          return {
            outputs: cached.outputs,
            error: cached.error,
            next: this.controlNext(node, s),
          };
        }

        const ex = this.executors[node.kind];
        if (!ex) throw new Error("Unknown node kind: " + node.kind);

        const isSource = node.kind === NodeKind.Literal || node.kind === NodeKind.Context;
        const inputs = isSource ? {} : await this.pullSlots(s, node);
        const result = await ex.evaluate(node, inputs, this);

        s.setOutput(node.id, result);
        return {
          outputs: result.outputs,
          error: result.error,
          next: this.controlNext(node, s),
        };
      }
    }
  }

  /** Action 节点取 slot[0].next，Source/Compute 返回 null */
  private controlNext(node: FlowNode, s: FrameStack): FlowNode | null {
    if (node.category !== NodeCategory.Action) return null;
    return s.nodes[(node as FlowActionNode).slots[0].next] ?? null;
  }

  // ═══════════════════════════════════════════════════════════
  // DataRef 解析
  // ═══════════════════════════════════════════════════════════

  private async pull(stack: FrameStack, slot: SlotValue): Promise<unknown> {
    if (!isDataRef(slot)) return slot;
    const ref = slot as DataRef;
    const upstream = stack.nodes[ref.nodeId];
    if (!upstream) throw new Error("DataRef target not found: " + ref.nodeId);
    const step = await this.stepNode(upstream, stack);
    if (step.error) throw step.error;
    return (step.outputs ?? {})[ref.field];
  }

  private async pullSlots(stack: FrameStack, node: FlowNode): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    for (const s of node.slots ?? []) {
      for (const [name, slot] of Object.entries(s.input ?? {})) {
        result[name] = await this.pull(stack, slot);
      }
    }
    return result;
  }

  // ═══════════════════════════════════════════════════════════
  // 条件过滤
  // ═══════════════════════════════════════════════════════════

  private async evaluateFilter(stack: FrameStack, filter: Filter): Promise<boolean> {
    if ("left" in filter && "right" in filter) {
      const cond = filter as Condition;
      return compareEval(
        await this.pull(stack, cond.left),
        cond.op,
        await this.pull(stack, cond.right),
      );
    }
    if ("conditions" in filter) {
      const group = filter as ConditionGroup;
      return this.logicEval(stack, group.op, group.conditions);
    }
    return false;
  }

  private async logicEval(stack: FrameStack, op: LogicOp, conditions: Filter[]): Promise<boolean> {
    switch (op) {
      case LogicOp.And: {
        for (const c of conditions)
          if (!(await this.evaluateFilter(stack, c))) return false;
        return true;
      }
      case LogicOp.Or: {
        for (const c of conditions)
          if (await this.evaluateFilter(stack, c)) return true;
        return false;
      }
      case LogicOp.Not:
        return !(await this.evaluateFilter(stack, conditions[0]));
      default:
        return false;
    }
  }
}
