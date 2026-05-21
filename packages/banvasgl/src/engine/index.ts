// ── App ──
export { default as App } from './App'
export { preprocessForExport } from './PreviewPreprocessor'
export type { PreprocessOptions } from './PreviewPreprocessor'

// ── Scene ──
export { default as Scene } from './Scene'
export type { SceneOptions } from './Scene'

// ── Camera ──
export * from './camera'

// ── Renderer ──
export { default as Renderer } from './Renderer'
export { default as CanvasContext } from './CanvasContext'

// ── Serializer ──
export { default as Serializer } from './Serializer'
export type { SerializerOptions, SerializedData } from './Serializer'

// ── SchemaRunner (Runtime) ──
export { setSchemaRunner, getSchemaRunner } from './SchemaRunner'
export type { ISchemaRunner, SchemaRunInput } from './SchemaRunner'

// ── Animation ──
export * from './animation'

// ── Operations ──
export {
    OperationStack,
    DiffType,
    Operation,
    TransactionManager,
    DiffApplier,
    LayerManager,
    SnapAlignManager,
    flattenViewTree,
    isViewInTree,
    clearSelectedStates,
    clearAllStates,
    groupViews,
    ungroupView,
} from './operations'
export type {
    Diff,
    ModifyDiff,
    AddDiff,
    RemoveDiff,
    ReorderDiff,
    ReorderChange,
    PropChange,
    ApplyDirection,
    OperationApplier,
    GroupResult,
    UngroupResult,
    SnapResult,
} from './operations'

// ── Property ──
export {
    PropertyAdapterRegistry,
    adapterRegistry,
    SPATIAL_PROPERTIES,
    SIZE_PROPERTIES,
    radiansToDegrees,
    degreesToRadians,
} from './property'
