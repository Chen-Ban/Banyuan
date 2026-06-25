/**
 * NodeDrawingContext — IDrawingContext 的 Node.js (node-canvas) 实现
 *
 * 将 node-canvas 的 CanvasRenderingContext2D 包装为平台无关的 IDrawingContext。
 * API 与 WebDrawingContext 对称，但适配 node-canvas 特有的类型差异。
 *
 * 注：node-canvas 模块通过动态 import 加载，类型定义使用 any 规避编译期依赖。
 */

import type {
  IDrawingContext,
  IGradient,
  IPattern,
  IImageSource,
  ITextMetrics,
  IVideoSource,
  IVideoLoadOptions,
  PatternRepeat,
} from '@banyuan/banvasgl'

// node-canvas 类型（运行时由 canvas 包提供）
type NodeCanvas = any
type NodeCanvasCtx = any
type NodeImage = any

// ── Node 渐变适配器 ──

class NodeGradient implements IGradient {
  constructor(private gradient: { addColorStop(offset: number, color: string): void }) {}
  addColorStop(offset: number, color: string): void {
    this.gradient.addColorStop(offset, color)
  }
}

// ── Node 图案适配器 ──

class NodePattern implements IPattern {
  constructor(private pattern: { setTransform(matrix?: object): void }) {}
  setTransform(matrix?: { a?: number; b?: number; c?: number; d?: number; e?: number; f?: number }): void {
    this.pattern.setTransform(matrix)
  }
}

// ── Node 图像源适配器 ──

class NodeImageSource implements IImageSource {
  readonly width: number
  readonly height: number
  readonly data: Uint8ClampedArray
  private _image: NodeImage

  constructor(image: NodeImage, imgData?: { width: number; height: number; data: Uint8ClampedArray }) {
    this._image = image
    this.width = image.width
    this.height = image.height
    // node-canvas Image 不直接暴露像素，需要时通过 imgData 注入或后续提取
    this.data = imgData?.data ?? new Uint8ClampedArray(this.width * this.height * 4)
  }

  get native(): NodeImage {
    return this._image
  }
}

// ── 辅助：解包／包装 ──

function unwrapStyle(value: string | IGradient | IPattern): string | object {
  if (value instanceof NodeGradient) return (value as unknown as { gradient: object }).gradient
  if (value instanceof NodePattern) return (value as unknown as { pattern: object }).pattern
  return value as string
}

function wrapGradient(g: object): IGradient {
  return new NodeGradient(g as { addColorStop(offset: number, color: string): void })
}

function wrapPattern(p: object | null): IPattern | null {
  return p ? new NodePattern(p as { setTransform(m?: object): void }) : null
}

// ── NodeDrawingContext ──

/**
 * NodeDrawingContext 将 node-canvas CanvasRenderingContext2D 适配为 IDrawingContext。
 */
export class NodeDrawingContext implements IDrawingContext {
  private _canvas: NodeCanvas | null

  constructor(
    public readonly ctx: NodeCanvasCtx,
    canvas?: NodeCanvas | null,
  ) {
    this._canvas = canvas ?? null
  }

  // ── 状态管理 ──
  save(): void {
    this.ctx.save()
  }
  restore(): void {
    this.ctx.restore()
  }

  // ── 变换矩阵 ──
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.ctx.setTransform(a, b, c, d, e, f)
  }
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.ctx.transform(a, b, c, d, e, f)
  }
  translate(x: number, y: number): void {
    this.ctx.translate(x, y)
  }
  scale(x: number, y: number): void {
    this.ctx.scale(x, y)
  }
  rotate(angle: number): void {
    this.ctx.rotate(angle)
  }

  // ── 全局合成 ──
  get globalAlpha(): number {
    return this.ctx.globalAlpha
  }
  set globalAlpha(v: number) {
    this.ctx.globalAlpha = v
  }
  get globalCompositeOperation(): string {
    return this.ctx.globalCompositeOperation
  }
  set globalCompositeOperation(v: string) {
    this.ctx.globalCompositeOperation = v
  }

  // ── 路径 ──
  beginPath(): void {
    this.ctx.beginPath()
  }
  closePath(): void {
    this.ctx.closePath()
  }
  moveTo(x: number, y: number): void {
    this.ctx.moveTo(x, y)
  }
  lineTo(x: number, y: number): void {
    this.ctx.lineTo(x, y)
  }
  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    counterclockwise?: boolean,
  ): void {
    this.ctx.arc(x, y, radius, startAngle, endAngle, counterclockwise)
  }
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void {
    this.ctx.arcTo(x1, y1, x2, y2, radius)
  }
  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void {
    this.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y)
  }
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void {
    this.ctx.quadraticCurveTo(cpx, cpy, x, y)
  }
  ellipse(
    x: number,
    y: number,
    rx: number,
    ry: number,
    rot: number,
    sa: number,
    ea: number,
    ccw?: boolean,
  ): void {
    this.ctx.ellipse(x, y, rx, ry, rot, sa, ea, ccw)
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.ctx.rect(x, y, w, h)
  }
  roundRect(x: number, y: number, w: number, h: number, radii?: number | number[]): void {
    if (typeof (this.ctx as unknown as { roundRect?: Function }).roundRect === 'function') {
      ;(
        this.ctx as unknown as {
          roundRect(x: number, y: number, w: number, h: number, radii?: number | number[]): void
        }
      ).roundRect(x, y, w, h, radii)
    }
  }

  // ── 填充与描边 ──
  fill(fillRule?: 'nonzero' | 'evenodd'): void {
    this.ctx.fill(fillRule)
  }
  stroke(): void {
    this.ctx.stroke()
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    this.ctx.fillRect(x, y, w, h)
  }
  strokeRect(x: number, y: number, w: number, h: number): void {
    this.ctx.strokeRect(x, y, w, h)
  }
  clearRect(x: number, y: number, w: number, h: number): void {
    this.ctx.clearRect(x, y, w, h)
  }
  clip(fillRule?: 'nonzero' | 'evenodd'): void {
    this.ctx.clip(fillRule)
  }

  // ── 样式属性 ──
  get fillStyle(): string | IGradient | IPattern {
    const v = this.ctx.fillStyle
    if (typeof v === 'object' && v !== null && 'addColorStop' in v) return wrapGradient(v)
    if (typeof v === 'object' && v !== null && 'setTransform' in v) return wrapPattern(v)!
    return v as string
  }
  set fillStyle(v: string | IGradient | IPattern) {
    this.ctx.fillStyle = unwrapStyle(v) as string
  }
  get strokeStyle(): string | IGradient | IPattern {
    const v = this.ctx.strokeStyle
    if (typeof v === 'object' && v !== null && 'addColorStop' in v) return wrapGradient(v)
    if (typeof v === 'object' && v !== null && 'setTransform' in v) return wrapPattern(v)!
    return v as string
  }
  set strokeStyle(v: string | IGradient | IPattern) {
    this.ctx.strokeStyle = unwrapStyle(v) as string
  }
  get lineWidth(): number {
    return this.ctx.lineWidth
  }
  set lineWidth(v: number) {
    this.ctx.lineWidth = v
  }
  get lineCap(): 'butt' | 'round' | 'square' {
    return this.ctx.lineCap as 'butt' | 'round' | 'square'
  }
  set lineCap(v: 'butt' | 'round' | 'square') {
    this.ctx.lineCap = v
  }
  get lineJoin(): 'round' | 'bevel' | 'miter' {
    return this.ctx.lineJoin as 'round' | 'bevel' | 'miter'
  }
  set lineJoin(v: 'round' | 'bevel' | 'miter') {
    this.ctx.lineJoin = v
  }
  get miterLimit(): number {
    return this.ctx.miterLimit
  }
  set miterLimit(v: number) {
    this.ctx.miterLimit = v
  }
  get lineDashOffset(): number {
    return this.ctx.lineDashOffset
  }
  set lineDashOffset(v: number) {
    this.ctx.lineDashOffset = v
  }
  setLineDash(segments: number[]): void {
    this.ctx.setLineDash(segments)
  }
  getLineDash(): number[] {
    return this.ctx.getLineDash()
  }

  // ── 阴影 ──
  get shadowBlur(): number {
    return this.ctx.shadowBlur
  }
  set shadowBlur(v: number) {
    this.ctx.shadowBlur = v
  }
  get shadowColor(): string {
    return this.ctx.shadowColor
  }
  set shadowColor(v: string) {
    this.ctx.shadowColor = v
  }
  get shadowOffsetX(): number {
    return this.ctx.shadowOffsetX
  }
  set shadowOffsetX(v: number) {
    this.ctx.shadowOffsetX = v
  }
  get shadowOffsetY(): number {
    return this.ctx.shadowOffsetY
  }
  set shadowOffsetY(v: number) {
    this.ctx.shadowOffsetY = v
  }

  // ── 渐变与图案 ──
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): IGradient {
    return wrapGradient(this.ctx.createLinearGradient(x0, y0, x1, y1))
  }
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): IGradient {
    return wrapGradient(this.ctx.createRadialGradient(x0, y0, r0, x1, y1, r1))
  }
  createConicGradient(startAngle: number, x: number, y: number): IGradient {
    const cg = (this.ctx as unknown as { createConicGradient?: (sa: number, x: number, y: number) => object })
      .createConicGradient
    if (cg) return wrapGradient(cg(startAngle, x, y))
    return this.createLinearGradient(x, y, x + 1, y + 1)
  }
  createPattern(image: IImageSource, repetition: PatternRepeat | null): IPattern | null {
    if (image instanceof NodeImageSource) {
      const pattern = this.ctx.createPattern(image.native, repetition ?? 'repeat')
      return pattern ? wrapPattern(pattern) : null
    }
    return null
  }

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
  drawImage(image: IImageSource, ...args: number[]): void {
    const img = image instanceof NodeImageSource ? image.native : image
    ;(this.ctx as any).drawImage(img, ...args)
  }

  // ── 图像平滑 ──
  get imageSmoothingEnabled(): boolean {
    return this.ctx.imageSmoothingEnabled
  }
  set imageSmoothingEnabled(v: boolean) {
    this.ctx.imageSmoothingEnabled = v
  }
  get imageSmoothingQuality(): 'low' | 'medium' | 'high' {
    return this.ctx.imageSmoothingQuality as 'low' | 'medium' | 'high'
  }
  set imageSmoothingQuality(v: 'low' | 'medium' | 'high') {
    this.ctx.imageSmoothingQuality = v
  }

  // ── 文字 ──
  get font(): string {
    return this.ctx.font
  }
  set font(v: string) {
    this.ctx.font = v
  }
  get textAlign(): 'start' | 'end' | 'left' | 'right' | 'center' {
    return this.ctx.textAlign as 'start' | 'end' | 'left' | 'right' | 'center'
  }
  set textAlign(v: 'start' | 'end' | 'left' | 'right' | 'center') {
    this.ctx.textAlign = v
  }
  get textBaseline(): 'top' | 'hanging' | 'middle' | 'alphabetic' | 'ideographic' | 'bottom' {
    return this.ctx.textBaseline as 'top' | 'hanging' | 'middle' | 'alphabetic' | 'ideographic' | 'bottom'
  }
  set textBaseline(v: 'top' | 'hanging' | 'middle' | 'alphabetic' | 'ideographic' | 'bottom') {
    this.ctx.textBaseline = v
  }
  fillText(text: string, x: number, y: number, maxWidth?: number): void {
    this.ctx.fillText(text, x, y, maxWidth)
  }
  strokeText(text: string, x: number, y: number, maxWidth?: number): void {
    this.ctx.strokeText(text, x, y, maxWidth)
  }
  measureText(text: string): ITextMetrics {
    return this.ctx.measureText(text)
  }

  // ── 像素操作 ──
  getImageData(sx: number, sy: number, sw: number, sh: number): IImageSource {
    const id = this.ctx.getImageData(sx, sy, sw, sh)
    return { width: id.width, height: id.height, data: id.data }
  }
  putImageData(imagedata: IImageSource, dx: number, dy: number): void {
    this.ctx.putImageData(imagedata as any, dx, dy)
  }
  createImageData(sw: number, sh: number): IImageSource {
    const id = this.ctx.createImageData(sw, sh)
    return { width: id.width, height: id.height, data: id.data }
  }

  // ── 命中测试 ──
  isPointInPath(x: number, y: number, fillRule?: 'nonzero' | 'evenodd'): boolean {
    return this.ctx.isPointInPath(x, y, fillRule)
  }
  isPointInStroke(x: number, y: number): boolean {
    return this.ctx.isPointInStroke(x, y)
  }

  // ── 平台媒体源创建 ──

  async loadImageSource(_src: string, _crossOrigin?: string): Promise<IImageSource> {
    throw new Error('NodeDrawingContext.loadImageSource not implemented — use NodeImageSource directly')
  }

  async loadVideoSource(_src: string, _options?: IVideoLoadOptions): Promise<IVideoSource> {
    throw new Error('NodeDrawingContext.loadVideoSource not implemented')
  }

  // ── 导出 ──

  exportImage(type?: string, quality?: number): string | null {
    if (!this._canvas || typeof (this._canvas as any).toDataURL !== 'function') return null
    try {
      return (this._canvas as any).toDataURL(type, quality)
    } catch {
      return null
    }
  }

  /** 导出为 Buffer（node-canvas 特有） */
  toBuffer(type?: string, quality?: number): Buffer | null {
    if (!this._canvas || typeof (this._canvas as any).toBuffer !== 'function') return null
    try {
      return (this._canvas as any).toBuffer(type ?? 'image/webp', quality != null ? { quality } : undefined)
    } catch {
      return null
    }
  }
}
