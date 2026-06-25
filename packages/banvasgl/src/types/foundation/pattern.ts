import type { Matrix2DInit } from './math.js'

/**
 * 平台无关的图案资源接口（引擎自有类型）
 *
 * 引擎通过 IDrawingContext.createPattern(image, repetition) 获取 IPattern 实例，
 * 赋值给 ctx.fillStyle/strokeStyle 实现图案填充/描边。
 * 平台适配器负责实现（Web: CanvasPattern, Skia: SkShader 等）。
 */
export interface IPattern {
  setTransform(matrix?: Matrix2DInit): void
}
