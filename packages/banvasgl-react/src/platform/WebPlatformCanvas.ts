/**
 * WebPlatformCanvas — IPlatformCanvas 的 Web 实现
 *
 * 基于 HTMLCanvasElement + OffscreenCanvas（双缓冲），
 * 通过 WebDrawingContext 适配器暴露 IDrawingContext。
 */

import type {
  IPlatformCanvas,
  IPlatformCanvasOptions,
  IDrawingContext,
} from "@banyuan/banvasgl";
import { WebDrawingContext } from "./WebDrawingContext.js";

export class WebPlatformCanvas implements IPlatformCanvas {
  private _mainCanvas: HTMLCanvasElement;
  private _bufferCanvas: OffscreenCanvas;
  private _mainCtx: CanvasRenderingContext2D;
  private _bufferCtx: CanvasRenderingContext2D;
  private _mainDrawing: WebDrawingContext;
  private _bufferDrawing: WebDrawingContext;
  private _dpr: number;
  private _options: IPlatformCanvasOptions;

  constructor(canvas: HTMLCanvasElement, options: IPlatformCanvasOptions = {}) {
    this._mainCanvas = canvas;
    this._options = {
      enableAntialiasing: true,
      enableImageSmoothing: true,
      backgroundColor: "transparent",
      clearColor: "#000000",
      ...options,
    };

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to get 2D rendering context from main canvas");
    }
    this._mainCtx = ctx;
    this._mainDrawing = new WebDrawingContext(ctx);

    // 创建离屏画布
    this._bufferCanvas = this._createBufferCanvas();
    this._bufferCanvas.width = this._mainCanvas.width;
    this._bufferCanvas.height = this._mainCanvas.height;
    const bCtx = this._bufferCanvas.getContext("2d") as unknown as CanvasRenderingContext2D;
    if (!bCtx) {
      throw new Error("Failed to get 2D rendering context from buffer canvas");
    }
    this._bufferCtx = bCtx;
    this._bufferDrawing = new WebDrawingContext(bCtx);

    this._dpr = options.dpr ?? 1;

    this._initContexts();
  }

  // ── IPlatformCanvas 实现 ──

  getMainContext(): IDrawingContext {
    return this._mainDrawing;
  }

  getBufferContext(): IDrawingContext {
    return this._bufferDrawing;
  }

  getWidth(): number {
    return this._mainCanvas.width;
  }

  getHeight(): number {
    return this._mainCanvas.height;
  }

  resize(width: number, height: number): void {
    const w = Math.round(width);
    const h = Math.round(height);
    if (this._mainCanvas.width === w && this._mainCanvas.height === h) return;
    this._mainCanvas.width = w;
    this._mainCanvas.height = h;
    if (this._bufferCanvas) {
      this._bufferCanvas.width = w;
      this._bufferCanvas.height = h;
    }
  }

  getDPR(): number {
    return this._dpr;
  }

  setDPR(dpr: number): void {
    this._dpr = dpr;
  }

  clear(): void {
    const bg = this._options.clearColor ?? "#000000";
    this._mainCtx.clearRect(0, 0, this._mainCanvas.width, this._mainCanvas.height);
    if (bg !== "transparent") {
      this._mainCtx.fillStyle = bg;
      this._mainCtx.fillRect(0, 0, this._mainCanvas.width, this._mainCanvas.height);
    }
    this._bufferCtx.clearRect(0, 0, this._bufferCanvas.width, this._bufferCanvas.height);
  }

  composite(): void {
    this._mainCtx.save();
    this._mainCtx.setTransform(1, 0, 0, 1, 0, 0);
    this._mainCtx.drawImage(this._bufferCanvas.transferToImageBitmap(), 0, 0);
    this._mainCtx.restore();
  }

  save(): void {
    this._mainCtx.save();
    this._bufferCtx.save();
  }

  restore(): void {
    this._mainCtx.restore();
    this._bufferCtx.restore();
  }

  setTransform(transform: number[]): void {
    const [a, b, c, d, e, f] = transform;
    this._mainCtx.setTransform(a, b, c, d, e, f);
    this._bufferCtx.setTransform(a, b, c, d, e, f);
  }

  transform(transform: number[]): void {
    const [a, b, c, d, e, f] = transform;
    this._mainCtx.transform(a, b, c, d, e, f);
    this._bufferCtx.transform(a, b, c, d, e, f);
  }

  getSize(): { width: number; height: number } {
    return { width: this._mainCanvas.width, height: this._mainCanvas.height };
  }

  setOptions(options: Partial<IPlatformCanvasOptions>): void {
    Object.assign(this._options, options);
    this._initContexts();
  }

  getOptions(): IPlatformCanvasOptions {
    return { ...this._options };
  }

  setAntialiasingEnabled(enabled: boolean): void {
    this._options.enableAntialiasing = enabled;
    this._mainCtx.imageSmoothingEnabled = enabled;
    this._bufferCtx.imageSmoothingEnabled = enabled;
  }

  setBackgroundColor(color: string): void {
    this._options.backgroundColor = color;
    this._options.clearColor = color;
  }

  setClearColor(color: string): void {
    this._options.clearColor = color;
  }

  toDataURL(type?: string, quality?: number): string {
    return this._mainCanvas.toDataURL(type, quality);
  }

  toBlob(callback: (blob: unknown) => void, type?: string, quality?: number): void {
    this._mainCanvas.toBlob((blob) => callback(blob), type, quality);
  }

  destroy(): void {
    // 清理引用
    (this as unknown as { _bufferCanvas: null })._bufferCanvas = null;
    (this as unknown as { _bufferCtx: null })._bufferCtx = null;
    (this as unknown as { _bufferDrawing: null })._bufferDrawing = null;
  }

  // ── Web 特定方法 ──

  /** 获取底层 HTMLCanvasElement */
  getCanvasElement(): HTMLCanvasElement {
    return this._mainCanvas;
  }

  // ── 内部方法 ──

  private _createBufferCanvas(): OffscreenCanvas {
    if (typeof OffscreenCanvas !== "undefined") {
      return new OffscreenCanvas(this._mainCanvas.width, this._mainCanvas.height);
    }
    throw new Error("OffscreenCanvas not available in this environment");
  }

  private _initContexts(): void {
    if (this._options.enableAntialiasing) {
      this._mainCtx.imageSmoothingEnabled = true;
      this._bufferCtx.imageSmoothingEnabled = true;
      this._mainCtx.imageSmoothingQuality = "high";
      this._bufferCtx.imageSmoothingQuality = "high";
    }
    if (this._options.enableImageSmoothing) {
      this._mainCtx.imageSmoothingEnabled = true;
      this._bufferCtx.imageSmoothingEnabled = true;
    }
  }
}
