import type {
  FlowSchema,
} from "@/types/foundation/flow/schema.js";
import type {
  Filter,
  Condition,
  ConditionGroup,
  SlotValue,
  DataRef,
} from "@/types/foundation/flow/common.js";
import type { FlowNode } from "@/types/foundation/flow/index.js";
import {
  NodeCategory,
  NodeKind,
  ParallelMode,
  CompareOp,
  LogicOp,
} from "@/types/foundation/flow/enums.js";
import { isDataRef } from "@/types/foundation/flow/common.js";
import type { FlowControlNode } from "@/types/foundation/flow/nodes/control.js";
import type { FlowActionNode } from "@/types/foundation/flow/nodes/action.js";
import type { FlowSourceNode } from "@/types/foundation/flow/nodes/source.js";
import type { FlowComputeNode } from "@/types/foundation/flow/nodes/compute.js";
import type { FlowFunctionNode } from "@/types/foundation/flow/nodes/function.js";
import type { FlowEnv, CapProxy, IFlowRunner } from "../context/index.js";
import { ContextFrame, FrameStack } from "../context/index.js";
import type { NodeExecutor } from "../executors/types.js";

const MAX_STEPS = 1000;

export class FlowRunner implements IFlowRunner {
  private executors: Record<string, NodeExecutor>;

  constructor(executors: Record<string, NodeExecutor>) {
    this.executors = executors;
  }

  async run(graph: FlowSchema, env: FlowEnv): Promise<void> {
    const root = new ContextFrame(
      { in: {}, local: {} },
      env.state,
      env.cap as unknown as CapProxy,
    );
    const stack = new FrameStack(root);
    await this.runGraph(graph, stack);
  }

  private async runGraph(
    graph: FlowSchema,
    stack: FrameStack,
  ): Promise<Record<string, unknown>> {
    const nodes = graph.nodes;
    const entryId = graph.entry;

    const entryNode = nodes[entryId];
    if (!entryNode) return {};

    let node: FlowNode | null = entryNode;
    let steps = 0;
    const executed = new Set<string>();
    const outputs = new Map<string, Record<string, unknown>>();

    while (node != null) {
      if (++steps > MAX_STEPS) throw new Error("Max steps exceeded");
      switch (node.category) {
        case NodeCategory.Control:
          node = await this.pushControl(node, nodes, stack, executed, outputs);
          break;
        case NodeCategory.Function:
          node = await this.invokeFunction(node as FlowFunctionNode, nodes, stack, executed, outputs);
          break;
        case NodeCategory.Action:
          node = await this.execute(node, nodes, stack, executed, outputs);
          break;
        default:
          throw new Error("Unexpected on control path: " + node.category);
      }
      if (node == null) return {};
    }
    return {};
  }

  /**
   * pushControl —— 执行 Control 类节点（Condition / Loop / Parallel）
   */
  private async pushControl(
    node: FlowControlNode,
    nodes: Record<string, FlowNode>,
    stack: FrameStack,
    executed: Set<string>,
    outputs: Map<string, Record<string, unknown>>,
  ): Promise<FlowNode | null> {
    switch (node.kind) {
      case NodeKind.Condition: {
        for (const s of node.slots) {
          if (
            this.evaluateFilter(s.filter, nodes, stack, executed, outputs)
          ) {
            return s.next ? (nodes[s.next] ?? null) : null;
          }
        }
        return null;
      }
      case NodeKind.Loop: {
        const s = node.slots[0];
        while (
          this.evaluateFilter(s.filter, nodes, stack, executed, outputs)
        ) {
          stack.enter(stack.frame.copy());
          await this.runGraph(s.body, stack);
          stack.leave();
        }
        return s.next ? (nodes[s.next] ?? null) : null;
      }
      case NodeKind.Parallel: {
        const bodies = node.slots[0].body;
        const mode = node.mode;
        const snapshots = bodies.map(() =>
          stack.frame.copy({ state: { view: {}, page: {}, app: {} } }),
        );
        const tasks = bodies.map((b, i) =>
          this.runGraph(b, new FrameStack(snapshots[i])),
        );
        let result: unknown;
        switch (mode) {
          case ParallelMode.All:
            result = await Promise.all(tasks);
            break;
          case ParallelMode.AllSettled: {
            const settled = await Promise.allSettled(tasks);
            result = settled.map((r) => ({
              status: r.status,
              value: r.status === "fulfilled" ? r.value : undefined,
              reason: r.status === "rejected" ? r.reason : undefined,
            }));
            break;
          }
          case ParallelMode.Race:
            result = await Promise.race(tasks);
            break;
          case ParallelMode.Any:
            result = await (Promise as any).any(tasks);
            break;
        }
        executed.add(node.id);
        outputs.set(node.id, { result });
        return node.slots[0].next ? (nodes[node.slots[0].next] ?? null) : null;
      }
      default:
        throw new Error("Unknown control: " + (node as any).kind);
    }
  }

  /**
   * invokeFunction —— 执行 Function 类节点
   *
   * 语义：创建新作用域边界（ContextFrame），隔离 vars（in=入参，local=局部），
   * state 和 cap 继承父帧。
   */
  private async invokeFunction(
    node: FlowFunctionNode,
    nodes: Record<string, FlowNode>,
    stack: FrameStack,
    executed: Set<string>,
    outputs: Map<string, Record<string, unknown>>,
  ): Promise<FlowNode | null> {
    const subSchema = node.slots[0].body;
    const inputs = await this.pullSlots(
      node.slots[0]?.input ?? {},
      nodes,
      stack,
      executed,
      outputs,
    );
    stack.enter(
      stack.frame.copy({ vars: { in: inputs, local: {} } }),
    );
    const result = await this.runGraph(subSchema, stack);
    stack.leave();
    executed.add(node.id);
    outputs.set(node.id, result);
    return node.slots[0].next ? (nodes[node.slots[0].next] ?? null) : null;
  }

  private async pull(
    slot: SlotValue,
    nodes: Record<string, FlowNode>,
    stack: FrameStack,
    executed: Set<string>,
    outputs: Map<string, Record<string, unknown>>,
  ): Promise<unknown> {
    if (!isDataRef(slot)) return slot;
    const ref = slot as DataRef;
    const upstream = nodes[ref.nodeId];
    if (!upstream) throw new Error("DataRef target not found: " + ref.nodeId);
    await this.execute(upstream, nodes, stack, executed, outputs);
    return outputs.get(upstream.id)![ref.field];
  }

  private async pullSlots(
    slots: Record<string, SlotValue>,
    nodes: Record<string, FlowNode>,
    stack: FrameStack,
    executed: Set<string>,
    outputs: Map<string, Record<string, unknown>>,
  ): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    for (const [name, slot] of Object.entries(slots))
      result[name] = await this.pull(slot, nodes, stack, executed, outputs);
    return result;
  }

  private evaluateFilter(
    filter: Filter,
    nodes: Record<string, FlowNode>,
    stack: FrameStack,
    executed: Set<string>,
    outputs: Map<string, Record<string, unknown>>,
  ): boolean {
    if ("left" in filter && "right" in filter) {
      const cond = filter as Condition;
      return this.compareEval(
        this.pull(cond.left, nodes, stack, executed, outputs),
        cond.op,
        this.pull(cond.right, nodes, stack, executed, outputs),
      );
    }
    if ("conditions" in filter) {
      const group = filter as ConditionGroup;
      return this.logicEval(
        group.op,
        group.conditions,
        nodes,
        stack,
        executed,
        outputs,
      );
    }
    return false;
  }

  private compareEval(left: unknown, op: CompareOp, right: unknown): boolean {
    switch (op) {
      case CompareOp.Eq:
        return (left as any) == (right as any);
      case CompareOp.Neq:
        return (left as any) != (right as any);
      case CompareOp.Gt:
        return (left as any) > (right as any);
      case CompareOp.Gte:
        return (left as any) >= (right as any);
      case CompareOp.Lt:
        return (left as any) < (right as any);
      case CompareOp.Lte:
        return (left as any) <= (right as any);
      case CompareOp.Contains:
        return String(left).includes(String(right));
      default:
        return false;
    }
  }

  private logicEval(
    op: LogicOp,
    conditions: Filter[],
    nodes: Record<string, FlowNode>,
    stack: FrameStack,
    executed: Set<string>,
    outputs: Map<string, Record<string, unknown>>,
  ): boolean {
    switch (op) {
      case LogicOp.And: {
        for (const c of conditions)
          if (!this.evaluateFilter(c, nodes, stack, executed, outputs))
            return false;
        return true;
      }
      case LogicOp.Or: {
        for (const c of conditions)
          if (this.evaluateFilter(c, nodes, stack, executed, outputs))
            return true;
        return false;
      }
      case LogicOp.Not:
        return !this.evaluateFilter(
          conditions[0],
          nodes,
          stack,
          executed,
          outputs,
        );
      default:
        return false;
    }
  }

  private async execute(
    node: FlowNode,
    nodes: Record<string, FlowNode>,
    stack: FrameStack,
    executed: Set<string>,
    outputs: Map<string, Record<string, unknown>>,
  ): Promise<FlowNode | null> {
    if (executed.has(node.id)) return null;
    switch (node.category) {
      case NodeCategory.Source: {
        const src = node as FlowSourceNode;
        const ex = this.executors[src.kind];
        if (!ex) throw new Error("Missing source executor: " + src.kind);
        const r = await ex.execute(
          src,
          {},
          stack.frame,
        );
        if (r.error) throw r.error;
        executed.add(node.id);
        outputs.set(node.id, r.outputs ?? {});
        return null;
      }
      case NodeCategory.Compute: {
        const comp = node as FlowComputeNode;
        const ex = this.executors[comp.kind];
        if (!ex) throw new Error("Unknown compute: " + comp.kind);
        const inputs = await this.pullSlots(
          this.flattenInputs(node),
          nodes,
          stack,
          executed,
          outputs,
        );
        const r = await ex.execute(
          comp,
          inputs,
          stack.frame,
        );
        if (r.error) throw r.error;
        executed.add(node.id);
        outputs.set(node.id, r.outputs ?? {});
        return null;
      }
      case NodeCategory.Action: {
        const act = node as FlowActionNode;
        const ex = this.executors[act.kind];
        if (!ex) throw new Error("Unknown action: " + act.kind);
        const inputs = await this.pullSlots(
          this.flattenInputs(node),
          nodes,
          stack,
          executed,
          outputs,
        );
        const r = await ex.execute(
          act,
          inputs,
          stack.frame,
        );
        if (r.error) {
          const errorSchema = act.slots.find((s) => s.onError)?.onError;
          if (errorSchema) {
            stack.enter(
              stack.frame.copy({
                vars: {
                  in: { error: r.error, partialOutputs: r.outputs ?? {} },
                  local: {},
                },
              }),
            );
            await this.runGraph(errorSchema, stack);
            stack.leave();
          } else throw r.error;
          return act.slots[0].next ? (nodes[act.slots[0].next] ?? null) : null;
        }
        executed.add(node.id);
        outputs.set(node.id, r.outputs ?? {});
        return act.slots[0].next ? (nodes[act.slots[0].next] ?? null) : null;
      }
      case NodeCategory.Control:
      case NodeCategory.Function:
        throw new Error("Cannot Pull control/function: " + node.id);
    }
  }

  private flattenInputs(node: FlowNode): Record<string, SlotValue> {
    const r: Record<string, SlotValue> = {};
    const slots = node.slots ?? [];
    for (const s of slots) Object.assign(r, s.input ?? {});
    return r;
  }
