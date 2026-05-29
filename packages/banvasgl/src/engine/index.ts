// ── App ──
export { default as App } from './App'

// ── Scene ──
export { default as Scene } from './Scene'
export type { SceneOptions } from './Scene'

// ── Camera ──
export * from './camera'

// ── Renderer ──
export { default as Renderer } from './Renderer'

// ── Serializer ──
export { default as Serializer } from './Serializer'
export type { SerializerOptions, SerializedData } from './Serializer'

// ── Migrations ──
export { MigrationRegistry, migrationRegistry } from './migrations/index.js'
export type { Migration } from './migrations/index.js'

// ── Animation（实际定义于 foundation/animation，此处重导出保持公共 API 兼容） ──
export * from '@/foundation/animation'

// ── Operations（公共 API 部分） ──
export {
    DiffType,
    Operation,
    TransactionManager,
    SnapAlignManager,
    flattenViewTree,
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
    PropChange,
    ApplyDirection,
    GroupResult,
    UngroupResult,
    SnapResult,
} from './operations'

// ── Property（实际定义于 view/property，此处重导出保持公共 API 兼容） ──
export {
    PropertyAdapterRegistry,
    adapterRegistry,
    SpatialProperties,
    SizeProperties,
    radiansToDegrees,
    degreesToRadians,
} from '@/view/property'
