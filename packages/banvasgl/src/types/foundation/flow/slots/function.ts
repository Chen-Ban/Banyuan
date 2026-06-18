import type { Next } from '../common.js'
import type { FlowSchema } from '../schema.js'
import type { SlotBase } from './common.js'

// ═══════════════════════════════════════════════════════════
// Function Slot —— localFunction
// ═══════════════════════════════════════════════════════════

/** localFunction 节点使用——内联函数，body 嵌入节点 */
export interface FlowLocalFunctionSlot extends SlotBase {
  body: FlowSchema;
  next: Next;
  onError?: FlowSchema;
}
