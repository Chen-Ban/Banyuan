export * from './data.js'
export * from './action.js'
export * from './control.js'
export * from './function.js'

import type { FlowDataSlot } from './data.js'
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
} from './control.js'
import type { FlowLocalFunctionSlot } from './function.js'

/** 统一插槽类型 */
export type FlowSlot =
  | FlowDataSlot
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
  | FlowLocalFunctionSlot;
