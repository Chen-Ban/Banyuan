export * from './common.js'
export * from './source.js'
export * from './compute.js'
export * from './action.js'
export * from './control.js'
export * from './function.js'

import type { FlowLiteralSourceSlot, FlowContextSourceSlot } from './source.js'
import type { FlowMathSlot, FlowCompareSlot, FlowLogicSlot, FlowConcatSlot, FlowFormatSlot, FlowGetSlot } from './compute.js'
import type {
  FlowSetVariableSlot,
  FlowNavigateSlot,
  FlowHttpRequestSlot,
  FlowCloudFunctionSlot,
  FlowDbQuerySlot,
  FlowDbInsertSlot,
  FlowDbUpdateSlot,
  FlowDbDeleteSlot,
} from './action.js'
import type {
  FlowConditionSlot,
  FlowLoopSlot,
  FlowParallelSlot,
  FlowReturnSlot,
} from './control.js'
import type { FlowFunctionSlot } from './function.js'

/** 统一插槽类型 */
export type FlowSlot =
  | FlowLiteralSourceSlot
  | FlowContextSourceSlot
  | FlowMathSlot
  | FlowCompareSlot
  | FlowLogicSlot
  | FlowConcatSlot
  | FlowFormatSlot
  | FlowGetSlot
  | FlowSetVariableSlot
  | FlowNavigateSlot
  | FlowHttpRequestSlot
  | FlowCloudFunctionSlot
  | FlowDbQuerySlot
  | FlowDbInsertSlot
  | FlowDbUpdateSlot
  | FlowDbDeleteSlot
  | FlowConditionSlot
  | FlowLoopSlot
  | FlowParallelSlot
  | FlowReturnSlot
  | FlowFunctionSlot;
