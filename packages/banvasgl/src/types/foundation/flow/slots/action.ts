import type { Next, SlotValue } from '../common.js'
import type { FlowSchema } from '../schema.js'
import type { SlotBase } from './common.js'

// ═══════════════════════════════════════════════════════════
// Action Slot —— 每种 Action 有专属 slot，类型化 IO
// ═══════════════════════════════════════════════════════════

/** 设置变量 */
export interface FlowSetVariableSlot extends SlotBase {
  input: { target: SlotValue; value: SlotValue }
  output: []
  onError?: FlowSchema
  next: Next
}

/** 设置 View 数据 */
export interface FlowSetViewDataSlot extends SlotBase {
  input: { viewId: SlotValue; key: SlotValue; value: SlotValue }
  output: []
  onError?: FlowSchema
  next: Next
}

/** 设置 View 可见性 */
export interface FlowSetViewVisibleSlot extends SlotBase {
  input: { viewId: SlotValue; visible: SlotValue }
  output: []
  onError?: FlowSchema
  next: Next
}

/** 播放动画 */
export interface FlowPlayAnimationSlot extends SlotBase {
  input: { viewId: SlotValue; animationId: SlotValue }
  output: []
  onError?: FlowSchema
  next: Next
}

/** 跳转页面 */
export interface FlowNavigateSlot extends SlotBase {
  input: { target: SlotValue }
  output: []
  onError?: FlowSchema
  next: Next
}

/** HTTP 请求 */
export interface FlowHttpRequestSlot extends SlotBase {
  input: { url: SlotValue; method?: SlotValue; headers?: SlotValue; body?: SlotValue }
  output: ['status', 'body', 'headers']
  onError?: FlowSchema
  next: Next
}

/** 云函数 = HTTP POST 调用后端执行指定函数 */
export interface FlowCloudFunctionSlot extends SlotBase {
  input: { functionId: SlotValue; method?: SlotValue; args?: SlotValue }
  output: ['status', 'body', 'headers']
  onError?: FlowSchema
  next: Next
}

/** 数据库查询 */
export interface FlowDbQuerySlot extends SlotBase {
  input: { collection: SlotValue; filter?: SlotValue }
  output: ['rows', 'count']
  onError?: FlowSchema
  next: Next
}

/** 数据库插入 */
export interface FlowDbInsertSlot extends SlotBase {
  input: { collection: SlotValue; document: SlotValue }
  output: ['id']
  onError?: FlowSchema
  next: Next
}

/** 数据库更新 */
export interface FlowDbUpdateSlot extends SlotBase {
  input: { collection: SlotValue; filter: SlotValue; update: SlotValue }
  output: ['matchedCount', 'modifiedCount']
  onError?: FlowSchema
  next: Next
}

/** 数据库删除 */
export interface FlowDbDeleteSlot extends SlotBase {
  input: { collection: SlotValue; filter?: SlotValue }
  output: ['deletedCount']
  onError?: FlowSchema
  next: Next
}
