/**
 * banvas-design —— BanvasGL 设计态 React 绑定
 *
 * 提供：
 * - useDesignBanvas：设计态 hook（编辑器功能完整集成）
 * - Workers：Web Worker 任务管理（WorkerManager / WorkerExecutor）
 * - Actions：编辑操作 API（view / page / history）
 * - Data：内置物料、页面树构建、右键菜单
 */

// ── 设计态 Hook ──
export { default as useDesignBanvas } from './useDesignBanvas.js'

// ── Components ──
export { createDesignMaterialPalette } from './components/DesignMaterialPalette.js'
export type { DesignMaterialPaletteProps } from './components/DesignMaterialPalette.js'
export { DesignContextMenu } from './components/DesignContextMenu.js'
export type { DesignContextMenuProps } from './components/DesignContextMenu.js'
export { NumberInput } from './components/NumberInput.js'
export type { NumberInputProps } from './components/NumberInput.js'
export { PropertiesTab } from './components/PropertiesTab.js'
export type { PropertiesTabProps } from './components/PropertiesTab.js'
export { StyleTab } from './components/StyleTab.js'
export type { StyleTabProps } from './components/StyleTab.js'
export { FieldSchemaMapEditor } from './components/FieldSchemaMapEditor.js'
export type { FieldSchemaMapEditorProps } from './components/FieldSchemaMapEditor.js'
export { DataTab } from './components/DataTab.js'
export type { DataTabProps } from './components/DataTab.js'
export { EventsTab } from './components/EventsTab.js'
export type { EventsTabProps, FlowEditorModalSlotProps } from './components/EventsTab.js'
export { PropertyPanel } from './components/PropertyPanel.js'
export type { PropertyPanelProps } from './components/PropertyPanel.js'
export { AppTree } from './components/AppTree.js'
export type { AppTreeProps } from './components/AppTree.js'
/** @deprecated 已更名为 AppTree，此别名将在下个大版本移除 */
export { AppTree as PageList } from './components/AppTree.js'
/** @deprecated 已更名为 AppTreeProps，此别名将在下个大版本移除 */
export type { AppTreeProps as PageListProps } from './components/AppTree.js'

// ── Workers ──
export { WorkerExecutor, getDefaultWorkerExecutor } from './workers/WorkerExecutor.js'
export { WorkerManager, getGlobalWorkerManager } from './workers/WorkerManager.js'
export type { WorkerHandler, WorkerHandlerResult } from './workers/types.js'

// ── Actions（供业务层扩展或直接使用） ──
// createBanvasActions / getClipboard / createViewActions 等已迁移至 @banyuan/banvasgl 核心包
// banvas-design 内部通过 ./actions/index.js 封装注入 viewCreatorStrategies
// 以下为 banvas-design 特有的创建策略表（具体 View 子类的实例化逻辑）
export { viewCreatorStrategies, graphCreatorStrategies } from './actions/viewCreateStrategies.js'

// ── Data ──
export { BUILTIN_COMPONENTS } from './data/builtinComponents.js'
export { buildPageNodes, buildPageNode, buildViewNode } from './data/builders.js'
export { buildViewContextMenuItems, buildCanvasContextMenuItems } from './data/contextMenu.js'

// ── Canvas Events（供业务层扩展） ──
export { useCanvasEvents } from './canvas/useCanvasEvents.js'
export type { ContextMenuHitResult, UseCanvasEventsOptions } from './canvas/useCanvasEvents.js'
export { useInputEvents } from './canvas/useInputEvents.js'
export type { UseInputEventsOptions } from './canvas/useInputEvents.js'
export { InteractionDispatcher } from './canvas/InteractionDispatcher.js'
export type { InteractionContext } from './canvas/InteractionDispatcher.js'
export { resolveActivationTarget } from './canvas/utils.js'
