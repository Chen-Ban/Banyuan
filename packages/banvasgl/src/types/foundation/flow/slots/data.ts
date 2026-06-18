import type { SlotValue } from '../common.js'

// ═══════════════════════════════════════════════════════════
// Data Slot —— Source / Compute 节点
// ═══════════════════════════════════════════════════════════

interface SlotBase {
  input: Record<string, SlotValue>;
  output: string[];
}

/** Source / Compute 节点使用——纯数据，无控制流出口 */
export interface FlowDataSlot extends SlotBase {}
