/**
 * @banyuan/banvasgl/react — 官方 React 集成层
 *
 * 提供 BanvasGL 在 React 环境下的标准初始化和交互 hook。
 * 业务层（useDesignBanvas / useFlowBanvas）在此基础上叠加业务逻辑。
 *
 * 使用方式：
 * ```ts
 * import { useFixedCanvasInit, useAdaptiveCanvasInit, useCanvasCamera } from '@banyuan/banvasgl/react'
 * ```
 */

// ── 新 hook（推荐使用） ──
export { useFixedCanvasInit } from './useFixedCanvasInit.js'
export type {
  UseFixedCanvasOptions,
  UseFixedCanvasResult,
  SelectedViewPos,
} from './useFixedCanvasInit.js'

export { useAdaptiveCanvasInit } from './useAdaptiveCanvasInit.js'
export type {
  UseAdaptiveCanvasOptions,
  UseAdaptiveCanvasResult,
} from './useAdaptiveCanvasInit.js'

// ── 旧 hook（已弃用，兼容层转发到新 hook） ──
export { useCanvasInit } from './useCanvasInit.js'
export type { UseCanvasOptions, UseCanvasInitResult } from './useCanvasInit.js'

export { useCanvasCamera } from './useCanvasCamera.js'
export type { UseCanvasCameraOptions, UseCanvasCameraResult } from './useCanvasCamera.js'

export { screenToWorld, worldToScreen, getCameraZoomLevel } from '@/engine/camera/cameraUtils.js'
