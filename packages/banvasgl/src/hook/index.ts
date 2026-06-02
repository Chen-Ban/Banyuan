/**
 * @banyuan/banvasgl/react — 官方 React 集成层
 *
 * 提供 BanvasGL 在 React 环境下的标准初始化和交互 hook。
 * 业务层（useDesignBanvas / useFlowBanvas）在此基础上叠加业务逻辑。
 *
 * 使用方式：
 * ```ts
 * import { useCanvasInit, useCanvasCamera } from '@banyuan/banvasgl/react'
 * ```
 */

export { useCanvasInit } from './useCanvasInit.js'
export type { UseCanvasOptions, UseCanvasInitResult, SelectedViewPos } from './useCanvasInit.js'

export { useCanvasCamera } from './useCanvasCamera.js'
export type { UseCanvasCameraOptions, UseCanvasCameraResult } from './useCanvasCamera.js'

export { screenToWorld, worldToScreen, getCameraZoomLevel } from '@/engine/camera/cameraUtils.js'
