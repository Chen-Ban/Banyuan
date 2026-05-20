/**
 * banvas-runtime —— BanvasGL 运行态 React 绑定
 *
 * 提供：
 * - useCanvasInit：底层 Canvas/App 初始化 hook
 * - useRuntimeBanvas：运行态 hook（渲染 + 事件触发 FlowSchema）
 * - useRuntimeEvents：运行态事件绑定
 */

// ── 底层初始化 ──
export { useCanvasInit } from './useCanvasInit.js'
export type { SerializedPageJSON, UseCanvasOptions, UseCanvasInitResult } from './useCanvasInit.js'

// ── 运行态 Hook ──
export { default as useRuntimeBanvas } from './useRuntimeBanvas.js'
export type { UseRuntimeBanvasOptions, UseRuntimeBanvasResult } from './useRuntimeBanvas.js'

// ── 运行态事件 ──
export { useRuntimeEvents } from './useRuntimeEvents.js'
export type { UseRuntimeEventsOptions } from './useRuntimeEvents.js'
