import { CompareOp, LogicOp } from './enums.js'

// ═══════════════════════════════════════════════════════════
// 基础原语 —— 数据引用 / 条件过滤 / 控制流出口
// ═══════════════════════════════════════════════════════════

/** 下一节点 ID，空字符串 "" 表示流程终点 */
export type Next = string;

export interface DataRef {
  nodeId: string;
  field: string;
}

export type SlotValue = unknown | DataRef;

export function isDataRef(v: unknown): v is DataRef {
  return typeof v === "object" && v !== null && "nodeId" in v && "field" in v;
}

export interface Condition {
  left: SlotValue;
  op: CompareOp;
  right: SlotValue;
}

export interface ConditionGroup {
  op: LogicOp;
  conditions: (Condition | ConditionGroup)[];
}

export type Filter = Condition | ConditionGroup;
