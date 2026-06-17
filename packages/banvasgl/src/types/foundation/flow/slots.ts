import type { NodeCategory } from './enums.js'
import type { Next, SlotValue, Filter } from './common.js'

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

/** Parallel 节点使用——每条 slot 是一个并行分支 */
export interface FlowParallelSlot extends SlotBase {
  /** 分支体子图（必填） */
  body: FlowSchema;
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

/** cloudFunction 节点使用——云函数，通过 functionId 引用远端 body */
export interface FlowCloudFunctionSlot extends SlotBase {
  /** 云函数 ID（必填） */
  functionId: string;
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
  | FlowLocalFunctionSlot
  | FlowCloudFunctionSlot;

// ═══════════════════════════════════════════════════════════
// FlowSchema —— 声明式流程图顶层结构
// ═══════════════════════════════════════════════════════════

export interface FlowSchema {
  version: string;
  entry: string;
  nodes: Record<string, AnyFlowNode>;
}

export interface AnyFlowNode {
  id: string;
  category: NodeCategory;
  kind: string;
  slots: FlowSlot[];
}

export const FLOW_SCHEMA_VERSION = "2.0.0";
