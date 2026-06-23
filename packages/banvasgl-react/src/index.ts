/**
 * @banyuan/banvasgl-react — BanvasGL React 集成层
 *
 * 提供：
 *   - Web 平台画布注入（WebCanvas / createWebDrawingContext）
 *   - React Hook（useFixedCanvasInit / useAdaptiveCanvasInit / useCanvasCamera）
 *
 * 使用方式：
 * ```ts
 * import { useFixedCanvasInit, WebCanvas } from '@banyuan/banvasgl-react'
 * ```
 */

// ── Web 平台适配器 ──
export { createWebDrawingContext, WebCanvas } from "./platform/index.js";
export type { WebCanvasOptions } from "./platform/index.js";

// ── React Hook ──
export { useFixedCanvasInit } from "./hooks/useFixedCanvasInit.js";
export type {
  UseFixedCanvasOptions,
  UseFixedCanvasResult,
  SelectedViewPos,
} from "./hooks/useFixedCanvasInit.js";

export { useAdaptiveCanvasInit } from "./hooks/useAdaptiveCanvasInit.js";
export type {
  UseAdaptiveCanvasOptions,
  UseAdaptiveCanvasResult,
} from "./hooks/useAdaptiveCanvasInit.js";

export { useCanvasCamera } from "./hooks/useCanvasCamera.js";
export type {
  UseCanvasCameraOptions,
  UseCanvasCameraResult,
} from "./hooks/useCanvasCamera.js";

// ── 相机工具（Web 平台） ──
export { screenToWorld, worldToScreen, getCameraZoomLevel } from "./hooks/cameraUtils.js";
