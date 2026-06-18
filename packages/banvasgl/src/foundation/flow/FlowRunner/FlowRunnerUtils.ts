import type { FlowNode } from "@/types/foundation/flow/index.js";
import type {
  Filter,
  Condition,
  ConditionGroup,
  SlotValue,
  DataRef,
} from "@/types/foundation/flow/common.js";
import { isDataRef } from "@/types/foundation/flow/common.js";
import type { FrameStack } from "../context/index.js";
import { CompareOp, LogicOp } from "@/types/foundation/flow/enums.js";

export interface RunnerCtx {
  nodes: Record<string, FlowNode>;
  stack: FrameStack;
  executed: Set<string>;
  outputs: Map<string, Record<string, unknown>>;
  returnRef: { value: Record<string, unknown> };
  steps: number;
  execute: (node: FlowNode) => Promise<FlowNode | null>;
}

// ── 数据解析 ──

export async function pull(ctx: RunnerCtx, slot: SlotValue): Promise<unknown> {
  if (!isDataRef(slot)) return slot;
  const ref = slot as DataRef;
  const upstream = ctx.nodes[ref.nodeId];
  if (!upstream) throw new Error("DataRef target not found: " + ref.nodeId);
  await ctx.execute(upstream);
  return ctx.outputs.get(upstream.id)![ref.field];
}

export async function pullSlots(ctx: RunnerCtx, node: FlowNode): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  const slots = node.slots ?? [];
  for (const s of slots) {
    for (const [name, slot] of Object.entries(s.input ?? {})) {
      result[name] = await pull(ctx, slot);
    }
  }
  return result;
}

// ── 条件过滤 ──

export function evaluateFilter(ctx: RunnerCtx, filter: Filter): boolean {
  if ("left" in filter && "right" in filter) {
    const cond = filter as Condition;
    return compareEval(
      pull(ctx, cond.left),
      cond.op,
      pull(ctx, cond.right),
    );
  }
  if ("conditions" in filter) {
    const group = filter as ConditionGroup;
    return logicEval(ctx, group.op, group.conditions);
  }
  return false;
}

export function compareEval(left: unknown, op: CompareOp, right: unknown): boolean {
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

export function logicEval(ctx: RunnerCtx, op: LogicOp, conditions: Filter[]): boolean {
  switch (op) {
    case LogicOp.And: {
      for (const c of conditions)
        if (!evaluateFilter(ctx, c))
          return false;
      return true;
    }
    case LogicOp.Or: {
      for (const c of conditions)
        if (evaluateFilter(ctx, c))
          return true;
      return false;
    }
    case LogicOp.Not:
      return !evaluateFilter(ctx, conditions[0]);
    default:
      return false;
  }
}

// ── 上下文恢复 ──

export function restoreCtx(
  ctx: RunnerCtx,
  nodes: Record<string, FlowNode>,
  stack: FrameStack,
  executed: Set<string>,
  outputs: Map<string, Record<string, unknown>>,
  returnRef: { value: Record<string, unknown> },
  steps: number,
): void {
  ctx.nodes = nodes;
  ctx.stack = stack;
  ctx.executed = executed;
  ctx.outputs = outputs;
  ctx.returnRef = returnRef;
  ctx.steps = steps;
}
