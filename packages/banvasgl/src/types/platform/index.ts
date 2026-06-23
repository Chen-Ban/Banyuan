/**
 * 平台抽象层 — barrel 导出
 *
 * IDrawingContext 是引擎与平台之间的唯一绘制契约。
 * 所有辅助类型（枚举、渐变、图案、文本度量等）已移至 types/foundation/，
 * 它们是引擎自有类型，不属平台注入层。
 */

// ── 绘图上下文（平台注入能力） ──
export type {
  IDrawingContext,
} from './drawing.js';

// ── 画布表面（平台注入能力） ──
export type {
  IDrawingSurface,
} from './surface.js';
