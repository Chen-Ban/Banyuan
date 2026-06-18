import type { Next, SlotValue, Filter } from './common.js'
import type { FlowSchema } from './schema.js'

// ═══════════════════════════════════════════════════════════
// Slot 类型 —— 节点的分支/槽位定义
// ═══════════════════════════════════════════════════════════

/** 插槽公共字段 */
interface SlotBase {
  input: Record<string, SlotValue>;
  output: string[];
}

/** Source / Compute 节点使用——纯数据，无控制流出口 */
export interface FlowDataSlot extends SlotBase {}

/** Action 节点使用 */
export interface FlowActionSlot extends SlotBase {
  /** 该分支执行出错时运行的错误处理 Schema */
  onError?: FlowSchema;
  /** 执行后的出口（必填） */
  next: Next;
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

/** localFunction 节点使用——内联函数，body 嵌入节点 */
export interface FlowLocalFunctionSlot extends SlotBase {
  /** 函数体（子 FlowSchema）——必选 */
  body: FlowSchema;
  /** 执行后的出口（必填） */
  next: Next;
  /** 错误处理子图 */
  onError?: FlowSchema;
}

/** 统一插槽类型 */
export type FlowSlot =
  | FlowDataSlot
  | FlowActionSlot
  | FlowConditionSlot
  | FlowLoopSlot
  | FlowParallelSlot
  | FlowLocalFunctionSlot;
