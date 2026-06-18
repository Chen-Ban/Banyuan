import type { SlotValue } from '../common.js'
import type { SlotBase } from './common.js'

// ═══════════════════════════════════════════════════════════
// Source Slot —— 叶子数据源
// ═══════════════════════════════════════════════════════════

/** 字面量数据源 */
export interface FlowLiteralSourceSlot extends SlotBase {
  input: { value: SlotValue }
  output: ['value']
}

/** 上下文数据源——从 frame 按 path 取值 */
export interface FlowContextSourceSlot extends SlotBase {
  input: { path: SlotValue }
  output: ['value']
}
