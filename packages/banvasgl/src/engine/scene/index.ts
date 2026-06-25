export { Scene } from './Scene'
export type { SceneOptions } from './Scene'

// ── Transaction（事务/操作栈体系） ──
export { DiffType, Operation, OperationStack, TransactionManager, DiffApplier } from './transaction'
export type {
  Diff,
  ModifyDiff,
  AddDiff,
  RemoveDiff,
  ReorderChange,
  ReorderDiff,
  PropChange,
  ApplyDirection,
  OperationApplier,
} from './transaction'

// ── Layer（层级管理） ──
export { LayerManager } from './layer'

// ── Snap（吸附对齐） ──
export { SnapAlignManager } from './snap'
export type { SnapResult } from './snap'

// ── Utils（视图树工具） ──
export {
  flattenViewTree,
  findViewPath,
  isViewInTree,
  getViewDepths,
  getActiveViews,
  getSelectedViews,
  clearActiveStates,
  clearSelectedStates,
  clearAllStates,
  groupViews,
  ungroupView,
} from './utils'
export type { GroupResult, UngroupResult } from './utils'
