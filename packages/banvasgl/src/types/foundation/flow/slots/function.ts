import type { Next } from '../common.js'
import type { FlowSchema } from '../schema.js'
import type { SlotBase } from './common.js'

// ═══════════════════════════════════════════════════════════
// Function Slot
// ═══════════════════════════════════════════════════════════

/** 内联函数——body 嵌入节点，创建新作用域执行子图 */
export interface FlowFunctionSlot extends SlotBase {
  body: FlowSchema
  next: Next
  onError?: FlowSchema
}
