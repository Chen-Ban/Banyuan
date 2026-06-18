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
  private cap: CapProxy;

  // ── 执行上下文（实例字段，避免层层透传） ──
  private nodes: Record<string, FlowNode> = {};
  private stack: FrameStack = new FrameStack();
  private executed: Set<string> = new Set();
  private outputs: Map<string, Record<string, unknown>> = new Map();
  private returnRef: { value: Record<string, unknown> } = { value: {} };
  private steps = 0;

  constructor(executors: Record<string, NodeExecutor>, cap: CapProxy) {
    this.executors = executors;
    this.cap = cap;
  }

  async run(graph: FlowSchema, env: FlowEnv): Promise<void> {
    this.stack = new FrameStack(
      new ContextFrame({ in: {}, local: {} }, env.state, this.cap),
    );
    await this.runGraph(graph);
  }

  private async runGraph(graph: FlowSchema): Promise<Record<string, unknown>> {
    const savedNodes = this.nodes;
    const savedStack = this.stack;
    const savedExecuted = this.executed;
    const savedOutputs = this.outputs;
    const savedReturnRef = this.returnRef;
    const savedSteps = this.steps;

    this.nodes = graph.nodes;
    this.executed = new Set<string>();
    this.outputs = new Map();
    this.returnRef = { value: {} };
    this.steps = 0;

    const entryNode = this.nodes[graph.entry];
    if (!entryNode) {
      this.restore(savedNodes, savedStack, savedExecuted, savedOutputs, savedReturnRef, savedSteps);
      return {};
    }

    let node: FlowNode | null = entryNode;

    while (node != null) {
      if (++this.steps > MAX_STEPS) throw new Error("Max steps exceeded");
      switch (node.category) {
        case NodeCategory.Control:
          node = await this.pushControl(node);
          break;
        case NodeCategory.Function:
          node = await this.invokeFunction(node as FlowFunctionNode);
          break;
        case NodeCategory.Action:
          node = await this.execute(node);
          break;
        default:
          throw new Error("Unexpected on control path: " + node.category);
      }
      if (node == null) {
        const value = this.returnRef.value;
        this.restore(savedNodes, savedStack, savedExecuted, savedOutputs, savedReturnRef, savedSteps);
        return value;
      }
    }
    const value = this.returnRef.value;
    this.restore(savedNodes, savedStack, savedExecuted, savedOutputs, savedReturnRef, savedSteps);
    return value;
  }

  private restore(
    nodes: Record<string, FlowNode>,
    stack: FrameStack,
    executed: Set<string>,
    outputs: Map<string, Record<string, unknown>>,
    returnRef: { value: Record<string, unknown> },
    steps: number,
  ): void {
    this.nodes = nodes;
    this.stack = stack;
    this.executed = executed;
    this.outputs = outputs;
    this.returnRef = returnRef;
    this.steps = steps;
  }

  // ═══════════════════════════════════════════════════════════
  // Control
  // ═══════════════════════════════════════════════════════════

  private async pushControl(node: FlowControlNode): Promise<FlowNode | null> {
    switch (node.kind) {
      case NodeKind.Condition: {
        for (const s of node.slots) {
          if (this.evaluateFilter(s.filter)) {
            return s.next ? (this.nodes[s.next] ?? null) : null;
          }
        }
        return null;
      }
      case NodeKind.Loop: {
        const s = node.slots[0];
        while (this.evaluateFilter(s.filter)) {
          this.stack.enter(this.stack.frame.copy());
          await this.runGraph(s.body);
          this.stack.leave();
        }
        return s.next ? (this.nodes[s.next] ?? null) : null;
      }
      case NodeKind.Parallel: {
        const bodies = node.slots[0].body;
        const mode = node.slots[0].mode;
        const savedStack = this.stack;
        const snapshots = bodies.map(() =>
          this.stack.frame.copy({ state: { view: {}, page: {}, app: {} } }),
        );
        const tasks = bodies.map((b, i) => {
          this.stack = new FrameStack(snapshots[i]);
          return this.runGraph(b);
        });
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
        this.stack = savedStack;
        this.executed.add(node.id);
        this.outputs.set(node.id, { result });
        return node.slots[0].next ? (this.nodes[node.slots[0].next] ?? null) : null;
      }
      case NodeKind.Return: {
        const s = node.slots[0];
        const values = await this.pullSlots(s.input ?? {});
        this.executed.add(node.id);
        this.outputs.set(node.id, values);
        this.returnRef.value = values;
        return null;
      }
      default:
        throw new Error("Unknown control: " + (node as any).kind);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Function
  // ═══════════════════════════════════════════════════════════

  private async invokeFunction(node: FlowFunctionNode): Promise<FlowNode | null> {
    const subSchema = node.slots[0].body;
    const inputs = await this.pullSlots(node.slots[0]?.input ?? {});
    this.stack.enter(this.stack.frame.copy({ vars: { in: inputs, local: {} } }));
    const result = await this.runGraph(subSchema);
    this.stack.leave();
    this.executed.add(node.id);
    this.outputs.set(node.id, result);
    return node.slots[0].next ? (this.nodes[node.slots[0].next] ?? null) : null;
  }

  // ═══════════════════════════════════════════════════════════
  // Data flow
  // ═══════════════════════════════════════════════════════════

  private async pull(slot: SlotValue): Promise<unknown> {
    if (!isDataRef(slot)) return slot;
    const ref = slot as DataRef;
    const upstream = this.nodes[ref.nodeId];
    if (!upstream) throw new Error("DataRef target not found: " + ref.nodeId);
    await this.execute(upstream);
    return this.outputs.get(upstream.id)![ref.field];
  }

  private async pullSlots(slots: Record<string, SlotValue>): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    for (const [name, slot] of Object.entries(slots))
      result[name] = await this.pull(slot);
    return result;
  }

  private evaluateFilter(filter: Filter): boolean {
    if ("left" in filter && "right" in filter) {
      const cond = filter as Condition;
      return this.compareEval(
        this.pull(cond.left),
        cond.op,
        this.pull(cond.right),
      );
    }
    if ("conditions" in filter) {
      const group = filter as ConditionGroup;
      return this.logicEval(group.op, group.conditions);
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

  private logicEval(op: LogicOp, conditions: Filter[]): boolean {
    switch (op) {
      case LogicOp.And: {
        for (const c of conditions)
          if (!this.evaluateFilter(c))
            return false;
        return true;
      }
      case LogicOp.Or: {
        for (const c of conditions)
          if (this.evaluateFilter(c))
            return true;
        return false;
      }
      case LogicOp.Not:
        return !this.evaluateFilter(conditions[0]);
      default:
        return false;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Execute (Source / Compute / Action)
  // ═══════════════════════════════════════════════════════════

  private async execute(node: FlowNode): Promise<FlowNode | null> {
    if (this.executed.has(node.id)) return null;
    switch (node.category) {
      case NodeCategory.Source: {
        const src = node as FlowSourceNode;
        const ex = this.executors[src.kind];
        if (!ex) throw new Error("Missing source executor: " + src.kind);
        const r = await ex.execute(src, {}, this.stack.frame);
        if (r.error) throw r.error;
        this.executed.add(node.id);
        this.outputs.set(node.id, r.outputs ?? {});
        return null;
      }
      case NodeCategory.Compute: {
        const comp = node as FlowComputeNode;
        const ex = this.executors[comp.kind];
        if (!ex) throw new Error("Unknown compute: " + comp.kind);
        const inputs = await this.pullSlots(this.flattenInputs(node));
        const r = await ex.execute(comp, inputs, this.stack.frame);
        if (r.error) throw r.error;
        this.executed.add(node.id);
        this.outputs.set(node.id, r.outputs ?? {});
        return null;
      }
      case NodeCategory.Action: {
        const act = node as FlowActionNode;
        const ex = this.executors[act.kind];
        if (!ex) throw new Error("Unknown action: " + act.kind);
        const inputs = await this.pullSlots(this.flattenInputs(node));
        const r = await ex.execute(act, inputs, this.stack.frame);
        if (r.error) {
          const errorSchema = act.slots.find((s) => s.onError)?.onError;
          if (errorSchema) {
            this.stack.enter(this.stack.frame.copy({
              vars: {
                in: { error: r.error, partialOutputs: r.outputs ?? {} },
                local: {},
              },
            }));
            await this.runGraph(errorSchema);
            this.stack.leave();
          } else throw r.error;
          return act.slots[0].next ? (this.nodes[act.slots[0].next] ?? null) : null;
        }
        this.executed.add(node.id);
        this.outputs.set(node.id, r.outputs ?? {});
        return act.slots[0].next ? (this.nodes[act.slots[0].next] ?? null) : null;
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
}
