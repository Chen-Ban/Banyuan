/**
 * 平台抽象层 — barrel 导出
 *
 * 所有平台无关的接口从这里统一导出。
 * banvasgl 引擎核心通过这些接口与平台交互，
 * 不再直接依赖 HTMLCanvasElement / CanvasRenderingContext2D 等 DOM 类型。
 */

// ── 绘图上下文 ──
export type {
  // 辅助类型
  IDrawingGradient,
  IDrawingPattern,
  IDrawingTextMetrics,
  IDrawingImageData,
  // Canvas 风格枚举（平台无关）
  DrawingFillRule,
  DrawingLineCap,
  DrawingLineJoin,
  DrawingTextAlign,
  DrawingTextBaseline,
  DrawingImageSmoothingQuality,
  DrawingMatrix2DInit,
  // 核心接口
  IDrawingContext,
} from './drawing.js';

// ── 画布表面（替代 IPlatformCanvas + ICanvasHost）──
export type {
  IDrawingSurface,
} from './surface.js';
