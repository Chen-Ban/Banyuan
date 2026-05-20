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

// ── Workers ──
export { WorkerExecutor, getDefaultWorkerExecutor } from './workers/WorkerExecutor.js'
export { WorkerManager, getGlobalWorkerManager } from './workers/WorkerManager.js'
export type { WorkerHandler, WorkerHandlerResult } from './workers/types.js'

// ── Actions（供业务层扩展或直接使用） ──
export { createBanvasActions, getClipboard } from './actions/index.js'
export { createViewActions } from './actions/viewActions.js'
export { createPageActions } from './actions/pageActions.js'
export { createHistoryActions } from './actions/historyActions.js'
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
