import type { Next, SlotValue, Filter } from '../common.js'
import type { FlowSchema } from '../schema.js'

// ═══════════════════════════════════════════════════════════
// Control Slot —— 每种 Control 有专属 slot
// ═══════════════════════════════════════════════════════════

interface SlotBase {
  input: Record<string, SlotValue>;
  output: string[];
}

/** Condition 节点使用——每条 slot 是一个条件分支 */
export interface FlowConditionSlot extends SlotBase {
  /** 分支匹配条件（必填） */
  filter: Filter;
  /** 条件命中后的出口（必填） */
  next: Next;
}

/** Loop 节点使用——单 slot = while(filter) { body } */
export interface FlowLoopSlot extends SlotBase {
  /** 循环条件（必填） */
  filter: Filter;
  /** 循环体子图（必填） */
  body: FlowSchema;
  /** 循环结束后的出口（必填） */
  next: Next;
}

/** Parallel 节点使用——单 slot 包含多个并行分支 */
export interface FlowParallelSlot extends SlotBase {
  /** 并行分支体数组（必填，至少一个） */
  body: FlowSchema[];
  /** 并行汇聚后的出口（必填） */
  next: Next;
}
