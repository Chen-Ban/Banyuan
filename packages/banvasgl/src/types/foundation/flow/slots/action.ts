import type { Next, SlotValue } from '../common.js'
import type { FlowSchema } from '../schema.js'

// ═══════════════════════════════════════════════════════════
// Action Slot —— 每种 Action 有专属 slot，标注 IO shape
// ═══════════════════════════════════════════════════════════

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
