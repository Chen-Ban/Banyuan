import type { SlotBase } from './common.js'

// ═══════════════════════════════════════════════════════════
// Source Slot —— 叶子数据源，无上游输入
// ═══════════════════════════════════════════════════════════

/** 字面量数据源 */
export interface FlowLiteralSourceSlot extends SlotBase {
  value: unknown
  output: ['value']
}

/** 上下文数据源——从 frame 按 path 取值 */
export interface FlowContextSourceSlot extends SlotBase {
  path: string
  output: ['value']
}
