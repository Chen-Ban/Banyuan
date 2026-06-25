/**
 * 平台无关的 2D 绘图上下文接口
 *
 * IDrawingContext 是 banvasgl 引擎与平台之间的唯一绘制契约。
 * 平台适配器（WebDrawingContext / SkiaDrawingContext 等）负责实现此接口，
 * 将平台原生 API（CanvasRenderingContext2D / SkCanvas 等）适配为引擎可用的统一接口。
 *
 * 设计原则：
 *   - 与 CanvasRenderingContext2D API 保持 1:1 语义映射，降低心智负担
 *   - 仅包含 banvasgl 内部实际调用的方法/属性
 *   - 渐变/图案/枚举等辅助类型定义在 types/foundation/，引擎自有
 *   - 图像/视频源数据契约在 types/foundation/media.ts，引擎自有
 */

import type { IImageSource, IVideoSource, IVideoLoadOptions, PatternRepeat } from '../foundation/media.js'
import type { FillRule, LineCap, LineJoin, ImageSmoothingQuality } from '../foundation/drawing.js'
import type { IGradient } from '../foundation/gradient.js'
import type { IPattern } from '../foundation/pattern.js'
import type { TextAlign, TextBaseline, ITextMetrics } from '../foundation/text.js'

export interface IDrawingContext {
  // ── 状态管理 ──
  save(): void
  restore(): void

  // ── 变换矩阵 ──
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void
  translate(x: number, y: number): void
  scale(x: number, y: number): void
  rotate(angle: number): void

  // ── 全局合成 ──
  globalAlpha: number
  globalCompositeOperation: string

  // ── 路径 ──
  beginPath(): void
  closePath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    counterclockwise?: boolean,
  ): void
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void
  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void
  ellipse(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
    startAngle: number,
    endAngle: number,
    counterclockwise?: boolean,
  ): void
  rect(x: number, y: number, w: number, h: number): void
  roundRect(x: number, y: number, w: number, h: number, radii?: number | number[]): void

  // ── 填充与描边 ──
  fill(fillRule?: FillRule): void
  stroke(): void
  fillRect(x: number, y: number, w: number, h: number): void
  strokeRect(x: number, y: number, w: number, h: number): void
  clearRect(x: number, y: number, w: number, h: number): void
  clip(fillRule?: FillRule): void

  // ── 样式属性 ──
  fillStyle: string | IGradient | IPattern
  strokeStyle: string | IGradient | IPattern
  lineWidth: number
  lineCap: LineCap
  lineJoin: LineJoin
  miterLimit: number
  lineDashOffset: number
  setLineDash(segments: number[]): void
  getLineDash(): number[]

  // ── 阴影 ──
  shadowBlur: number
  shadowColor: string
  shadowOffsetX: number
  shadowOffsetY: number

  // ── 渐变与图案 ──
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): IGradient
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): IGradient
  createConicGradient(startAngle: number, x: number, y: number): IGradient
  createPattern(image: IImageSource, repetition: PatternRepeat | null): IPattern | null

  // ── 图像 ──
  drawImage(image: IImageSource, dx: number, dy: number): void
  drawImage(image: IImageSource, dx: number, dy: number, dw: number, dh: number): void
  drawImage(
    image: IImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void

  // ── 图像平滑 ──
  imageSmoothingEnabled: boolean
  imageSmoothingQuality: ImageSmoothingQuality

  // ── 文字 ──
  font: string
  textAlign: TextAlign
  textBaseline: TextBaseline
  fillText(text: string, x: number, y: number, maxWidth?: number): void
  strokeText(text: string, x: number, y: number, maxWidth?: number): void
  measureText(text: string): ITextMetrics

  // ── 像素操作 ──
  getImageData(sx: number, sy: number, sw: number, sh: number): IImageSource
  putImageData(imagedata: IImageSource, dx: number, dy: number): void
  createImageData(sw: number, sh: number): IImageSource

  // ── 命中测试 ──
  isPointInPath(x: number, y: number, fillRule?: FillRule): boolean
  isPointInStroke(x: number, y: number): boolean

  // ── 平台媒体源创建 ──
  loadImageSource(src: string, crossOrigin?: string): Promise<IImageSource>
  loadVideoSource(src: string, options?: IVideoLoadOptions): Promise<IVideoSource>
}
