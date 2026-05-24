/**
 * banvas-flow-editor —— 流程图编辑器包
 *
 * 提供 BanvasGL 上的流程图编辑能力：
 * - Views: NodeView / PortView / EdgeView
 * - Hook: useFlowBanvas / useFlowCanvasEvents
 * - Materials: FlowNodeMaterial / CLIENT_FLOW_MATERIALS / SERVER_FLOW_MATERIALS
 * - Registry: installFlowViews（注册流程图视图类型到 BanvasGL ViewRegistry）
 */

// ── Constants ──
export { FlowViewType } from './constants.js'

// ── Views ──
export { NodeView, PortView, EdgeView } from './views/index.js'
export type { NodeViewOptions, PortDefinition } from './views/index.js'
export type { PortViewOptions } from './views/index.js'
export type { EdgeViewOptions } from './views/index.js'

// ── Hooks ──
export { default as useFlowBanvas } from './hook/useFlowBanvas.js'
export type { UseFlowBanvasOptions, UseFlowBanvasResult, FlowMode, IFlowDragProps, SelectedNodePos } from './hook/useFlowBanvas.js'
export { useFlowCanvasEvents } from './hook/useFlowCanvasEvents.js'
export type { UseFlowCanvasEventsOptions, FlowContextMenuEvent } from './hook/useFlowCanvasEvents.js'

// ── Components ──
export { createFlowMaterialPalette } from './components/FlowMaterialPalette.js'
export type { FlowMaterialPaletteProps } from './components/FlowMaterialPalette.js'
export { FlowContextMenu } from './components/FlowContextMenu.js'
export type { FlowContextMenuProps, FlowContextMenuState, FlowContextMenuItem } from './components/FlowContextMenu.js'
export { FlowEditorModal } from './components/FlowEditorModal.js'
export type { FlowEditorModalProps } from './components/FlowEditorModal.js'
export { NodeSchemaPopover } from './components/NodeSchemaPopover.js'
export type { NodeSchemaPopoverProps } from './components/NodeSchemaPopover.js'

// ── Materials ──
export { CLIENT_FLOW_MATERIALS, SERVER_FLOW_MATERIALS } from './materials.js'
export type { FlowNodeMaterial } from './materials.js'

// ── Registry ──
export { installFlowViews } from './install.js'
