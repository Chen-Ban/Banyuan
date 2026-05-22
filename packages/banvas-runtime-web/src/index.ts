/**
 * @banyuan/banvas-runtime-web —— BanvasGL 运行态 Web 平台适配
 *
 * Web/React 实现：Canvas 2D + React Hook
 *
 * 实现 @banyuan/banvas-runtime 定义的运行态契约：
 * - useCanvasInit：底层 Canvas/App 初始化（Web Canvas 2D + DPR 适配）
 * - useRuntimeBanvas：运行态 hook（渲染 + 事件触发 FlowSchema）
 * - useRuntimeEvents：Web DOM 事件绑定
 *
 * 同时 re-export @banyuan/banvas-runtime 的类型，方便消费者一站式导入。
 */

// ── 底层初始化 ──
export { useCanvasInit } from './useCanvasInit.js'
export type { UseCanvasOptions, UseCanvasInitResult } from './useCanvasInit.js'

// ── Canvas 缩放 ──
export { useCanvasZoom } from './useCanvasZoom.js'
export type { UseCanvasZoomOptions, UseCanvasZoomResult } from './useCanvasZoom.js'

// ── 运行态 Hook ──
export { default as useRuntimeBanvas } from './useRuntimeBanvas.js'
export type { UseRuntimeBanvasOptions, UseRuntimeBanvasResult } from './useRuntimeBanvas.js'

// ── 运行态事件 ──
export { useRuntimeEvents } from './useRuntimeEvents.js'
export type { UseRuntimeEventsOptions } from './useRuntimeEvents.js'

// ── Re-export 契约层类型（方便消费者不用同时 import 两个包） ──
export type { SerializedPageJSON } from '@banyuan/banvas-runtime'
