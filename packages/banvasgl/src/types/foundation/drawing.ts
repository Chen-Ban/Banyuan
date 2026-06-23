/**
 * 平台无关的绘制枚举类型（引擎自有）
 *
 * 替代 lib.dom 中的 CanvasFillRule、CanvasLineCap、CanvasLineJoin、ImageSmoothingQuality。
 * 这些类型描述绘制操作的参数，而非平台注入的能力。
 */

/** 填充规则 */
export type FillRule = 'nonzero' | 'evenodd';

/** 线段端点样式 */
export type LineCap = 'butt' | 'round' | 'square';

/** 线段连接样式 */
export type LineJoin = 'round' | 'bevel' | 'miter';

/** 图像平滑质量 */
export type ImageSmoothingQuality = 'low' | 'medium' | 'high';
