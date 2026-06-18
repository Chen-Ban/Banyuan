import type { Next, SlotValue } from '../common.js'
import type { FlowSchema } from '../schema.js'

// ═══════════════════════════════════════════════════════════
// Function Slot —— localFunction
// ═══════════════════════════════════════════════════════════

interface SlotBase {
  input: Record<string, SlotValue>;
  output: string[];
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
