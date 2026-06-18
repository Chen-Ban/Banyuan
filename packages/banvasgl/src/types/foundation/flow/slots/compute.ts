import type { SlotValue } from '../common.js'
import type { SlotBase } from './common.js'

// ═══════════════════════════════════════════════════════════
// Compute Slot —— 纯计算/变换
// ═══════════════════════════════════════════════════════════

/** 数学运算 */
export interface FlowMathSlot extends SlotBase {
  input: { op: SlotValue; a: SlotValue; b: SlotValue }
  output: ['value']
}

/** 比较运算 */
export interface FlowCompareSlot extends SlotBase {
  input: { op: SlotValue; a: SlotValue; b: SlotValue }
  output: ['value']
}

/** 逻辑运算 */
export interface FlowLogicSlot extends SlotBase {
  input: { op: SlotValue; operands: SlotValue }
  output: ['value']
}

/** 字符串拼接 */
export interface FlowConcatSlot extends SlotBase {
  input: { parts: SlotValue; separator?: SlotValue }
  output: ['value']
}

/** 模板格式化 */
export interface FlowFormatSlot extends SlotBase {
  input: { template: SlotValue; values: SlotValue }
  output: ['value']
}

/** 按路径从 object 取嵌套字段 */
export interface FlowGetSlot extends SlotBase {
  input: { path: SlotValue; object: SlotValue }
  output: ['value']
}
