/**
 * WebSurface — IDrawingSurface 的 Web 实现
 *
 * 基于 HTMLCanvasElement + OffscreenCanvas（双缓冲），
 * 通过 WebDrawingContext 适配器暴露 IDrawingContext。
 *
 * 平台细节（DOM 元素、双缓冲合成策略）全部封装在此类内部，
 * 引擎只看到 IDrawingSurface 接口。
 */

import type { IDrawingSurface, IDrawingContext } from '@banyuan/banvasgl'
import { createWebDrawingContext } from './WebDrawingContext.js'

/** WebSurface 构造选项 */
export interface WebSurfaceOptions {
  /** 是否启用抗锯齿（默认 true） */
  antialias?: boolean
  /** 清空画布时的填充色（默认 "#fff"） */
  clearColor?: string
}

export class WebSurface implements IDrawingSurface {
  private _canvas: HTMLCanvasElement
  private _offscreen: OffscreenCanvas

  readonly main: IDrawingContext
  readonly offscreen: IDrawingContext

  private _dpr: number
  private _clearColor: string

  constructor(canvas: HTMLCanvasElement, options: WebSurfaceOptions = {}) {
    this._canvas = canvas
    this._clearColor = options.clearColor ?? '#fff'
    this._dpr = typeof window !== 'undefined' ? (window.devicePixelRatio ?? 1) : 1

    // 主画布上下文
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Failed to get 2D rendering context from main canvas')
    this.main = createWebDrawingContext(ctx)

    // 离屏画布 + 上下文
    if (typeof OffscreenCanvas === 'undefined') {
      throw new Error('OffscreenCanvas not available in this environment')
    }
    this._offscreen = new OffscreenCanvas(canvas.width, canvas.height)
    const bCtx = this._offscreen.getContext('2d') as unknown as CanvasRenderingContext2D
    if (!bCtx) throw new Error('Failed to get 2D rendering context from buffer canvas')
    this.offscreen = createWebDrawingContext(bCtx)

    // 抗锯齿配置
    if (options.antialias !== false) {
      this.main.imageSmoothingEnabled = true
      this.main.imageSmoothingQuality = 'high'
      this.offscreen.imageSmoothingEnabled = true
      this.offscreen.imageSmoothingQuality = 'high'
    }
  }

  // ── IDrawingSurface 实现 ──

  get width(): number {
    return this._canvas.width
  }

  get height(): number {
    return this._canvas.height
  }

  get dpr(): number {
    return this._dpr
  }

  set dpr(value: number) {
    this._dpr = value
  }

  resize(logicalWidth: number, logicalHeight: number): void {
    // 防御性检查：dispose 后 _offscreen 为 null，不应继续操作
    if (!this._offscreen) return
    const w = Math.round(logicalWidth * this._dpr)
    const h = Math.round(logicalHeight * this._dpr)
    if (this._canvas.width === w && this._canvas.height === h) return
    this._canvas.width = w
    this._canvas.height = h
    this._offscreen.width = w
    this._offscreen.height = h
  }

  clear(): void {
    if (!this._offscreen) return
    this.main.clearRect(0, 0, this._canvas.width, this._canvas.height)
    if (this._clearColor !== 'transparent') {
      this.main.fillStyle = this._clearColor
      this.main.fillRect(0, 0, this._canvas.width, this._canvas.height)
    }
    this.offscreen.clearRect(0, 0, this._offscreen.width, this._offscreen.height)
  }

  present(): void {
    if (!this._offscreen) return
    // 双缓冲合成：将离屏 buffer 以 ImageBitmap 形式绘制到主 canvas。
    // 使用原生 Canvas API 避免经过 IDrawingContext 抽象层（ImageBitmap 不是 IImageSource）。
    const mainCtx = this._canvas.getContext('2d')
    if (!mainCtx) return
    mainCtx.save()
    mainCtx.setTransform(1, 0, 0, 1, 0, 0)
    mainCtx.drawImage(this._offscreen.transferToImageBitmap(), 0, 0)
    mainCtx.restore()
  }

  dispose(): void {
    ;(this as unknown as { _offscreen: null })._offscreen = null
  }

  export(type?: string, quality?: number): string | null {
    return this._canvas.toDataURL(type, quality) ?? null
  }

  // ── 帧调度 ──

  requestFrame(callback: (timestamp: number) => void): number {
    return requestAnimationFrame(callback)
  }

  cancelFrame(handle: number): void {
    cancelAnimationFrame(handle)
  }

  // ── Web 特定方法 ──

  /** 获取底层 HTMLCanvasElement（供宿主层绑定 DOM 事件） */
  getCanvasElement(): HTMLCanvasElement {
    return this._canvas
  }
}
