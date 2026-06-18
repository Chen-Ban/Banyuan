import type { SlotValue } from '../common.js'

/** 插槽公共基类 */
export interface SlotBase {
  input: Record<string, SlotValue>;
  output: readonly string[];
}
