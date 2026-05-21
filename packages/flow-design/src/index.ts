/**
 * banvas-flow-editor —— 流程图编辑器包
 *
 * 提供 BanvasGL 上的流程图编辑能力：
 * - Views: NodeView / PortView / EdgeView
 * - Hook: useFlowBanvas / useFlowCanvasEvents
 * - Registry: installFlowViews（注册流程图视图类型到 BanvasGL ViewRegistry）
 */

// ── Constants ──
export { FLOW_VIEWTYPE } from './constants.js'

// ── Views ──
export { NodeView, PortView, EdgeView } from './views/index.js'
export type { NodeViewOptions, PortDefinition } from './views/index.js'
export type { PortViewOptions } from './views/index.js'
export type { EdgeViewOptions } from './views/index.js'

// ── Hooks ──
export { default as useFlowBanvas } from './hook/useFlowBanvas.js'
export type { UseFlowBanvasOptions, UseFlowBanvasResult } from './hook/useFlowBanvas.js'
export { useFlowCanvasEvents } from './hook/useFlowCanvasEvents.js'
export type { UseFlowCanvasEventsOptions } from './hook/useFlowCanvasEvents.js'

// ── Registry ──
export { installFlowViews } from './install.js'
