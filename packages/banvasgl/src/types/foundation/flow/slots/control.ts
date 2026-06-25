import type { Next, Filter } from '../common.js'
import type { FlowSchema } from '../schema.js'
import type { SlotBase } from './common.js'
import { ParallelMode } from '../enums.js'

// ═══════════════════════════════════════════════════════════
// Control Slot —— 每种 Control 有专属 slot
// ═══════════════════════════════════════════════════════════

/** Condition 节点使用——每条 slot 是一个条件分支 */
export interface FlowConditionSlot extends SlotBase {
  filter: Filter
  next: Next
}

/** Loop 节点使用——单 slot = while(filter) { body } */
export interface FlowLoopSlot extends SlotBase {
  filter: Filter
  body: FlowSchema
  next: Next
}

/** Parallel 节点使用——单 slot 包含多个并行分支 */
export interface FlowParallelSlot extends SlotBase {
  body: FlowSchema[]
  mode: ParallelMode
  next: Next
}

/** Return 节点使用——collect inputs, terminate subgraph */
export interface FlowReturnSlot extends SlotBase {}
