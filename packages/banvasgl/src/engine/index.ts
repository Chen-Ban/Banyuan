// ── App ──
export { App } from "./App";

// ── Scene ──
export {
  Scene,
  DiffType,
  Operation,
  TransactionManager,
  SnapAlignManager,
  flattenViewTree,
  clearAllStates,
  groupViews,
  ungroupView,
} from "./scene/index";
export type {
  SceneOptions,
  Diff,
  ModifyDiff,
  AddDiff,
  RemoveDiff,
  ReorderDiff,
  PropChange,
  ApplyDirection,
  GroupResult,
  UngroupResult,
  SnapResult,
} from "./scene/index";

// ── Camera ──
export * from "./camera";

// ── Renderer ──
export { Renderer, CanvasContext } from "./renderer/index";

// ── Serialization ──
export { Serializer } from "./serialization";
export type { SerializerOptions, SerializedData } from "./serialization";
