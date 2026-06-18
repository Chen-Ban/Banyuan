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

/** Action 节点使用——每种 Action 有专属 slot，标注 IO shape */

/** 设置变量 */
export interface FlowSetVariableSlot {
  input: { target: SlotValue; value: SlotValue }
  output: []
  onError?: FlowSchema
  next: Next
}

/** 跳转页面 */
export interface FlowNavigateSlot {
  input: { target: SlotValue }
  output: []
  onError?: FlowSchema
  next: Next
}

/** HTTP 请求 */
export interface FlowHttpRequestSlot {
  input: { url: SlotValue; method?: SlotValue; headers?: SlotValue; body?: SlotValue }
  output: ['status', 'body', 'headers']
  onError?: FlowSchema
  next: Next
}

/** 云函数 = HTTP POST 调用后端执行指定函数 */
export interface FlowCloudFunctionSlot {
  input: { functionId: SlotValue; method?: SlotValue; args?: SlotValue }
  output: ['status', 'body', 'headers']
  onError?: FlowSchema
  next: Next
}

/** 数据库查询 */
export interface FlowDbQuerySlot {
  input: { collection: SlotValue; filter?: SlotValue }
  output: ['rows', 'count']
  onError?: FlowSchema
  next: Next
}

/** 数据库插入 */
export interface FlowDbInsertSlot {
  input: { collection: SlotValue; document: SlotValue }
  output: ['id']
  onError?: FlowSchema
  next: Next
}

/** 数据库更新 */
export interface FlowDbUpdateSlot {
  input: { collection: SlotValue; filter: SlotValue; update: SlotValue }
  output: ['matchedCount', 'modifiedCount']
  onError?: FlowSchema
  next: Next
}

/** 数据库删除 */
export interface FlowDbDeleteSlot {
  input: { collection: SlotValue; filter?: SlotValue }
  output: ['deletedCount']
  onError?: FlowSchema
  next: Next
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
  | FlowSetVariableSlot
  | FlowNavigateSlot
  | FlowHttpRequestSlot
  | FlowCloudFunctionSlot
  | FlowDbQuerySlot
  | FlowDbInsertSlot
  | FlowDbUpdateSlot
  | FlowDbDeleteSlot
  | FlowConditionSlot
  | FlowLoopSlot
  | FlowParallelSlot
  | FlowLocalFunctionSlot;
