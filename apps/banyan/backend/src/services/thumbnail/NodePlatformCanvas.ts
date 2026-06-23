/**
 * NodeSurface — IDrawingSurface 的 Node.js (node-canvas) 实现
 *
 * 基于单个 node-canvas 实例，主/缓冲上下文复用同一画布。
 * 用于服务端缩略图生成，无需双缓冲。
 *
 * 注：node-canvas 模块通过动态 import 加载，类型定义使用 any 规避编译期依赖。
 */

import type { IDrawingSurface, IDrawingContext } from "@banyuan/banvasgl";
import { NodeDrawingContext } from "./NodeDrawingContext.js";

// node-canvas 运行时类型（由 canvas 包提供）
type NodeCanvas = any;
type NodeCanvasCtx = any;

// 动态加载 canvas 模块
let _createCanvas: ((w: number, h: number) => NodeCanvas) | null = null;
function getCreateCanvas(): (w: number, h: number) => NodeCanvas {
  if (!_createCanvas) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const canvas = require('canvas');
    _createCanvas = canvas.createCanvas;
  }
  return _createCanvas!;
}

export class NodeSurface implements IDrawingSurface {
  private _canvas: NodeCanvas;
  private _ctx: NodeCanvasCtx;
  readonly main: IDrawingContext;
  readonly offscreen: IDrawingContext;
  private _dpr: number;
  private _destroyed: boolean = false;

  constructor(width: number, height: number) {
    const createCanvas = getCreateCanvas();
    this._canvas = createCanvas(width, height);
    this._ctx = this._canvas.getContext("2d");
    this._dpr = 1; // 服务端渲染使用 1x

    const drawingCtx = new NodeDrawingContext(this._ctx, this._canvas);
    this.main = drawingCtx;
    this.offscreen = drawingCtx; // 单画布模式，主/离屏复用同一上下文

    this._initContext();
  }

  // ── IDrawingSurface 实现 ──

  get width(): number {
    return this._canvas.width;
  }

  get height(): number {
    return this._canvas.height;
  }

  get dpr(): number {
    return this._dpr;
  }

  set dpr(value: number) {
    this._dpr = value;
  }

  resize(logicalWidth: number, logicalHeight: number): void {
    if (this._destroyed) return;
    const w = Math.round(logicalWidth * this._dpr);
    const h = Math.round(logicalHeight * this._dpr);
    if (this._canvas.width === w && this._canvas.height === h) return;
    this._canvas.width = w;
    this._canvas.height = h;
    this._initContext();
  }

  clear(): void {
    this.main.clearRect(0, 0, this._canvas.width, this._canvas.height);
  }

  present(): void {
    // 单画布模式，无需合成
  }

  dispose(): void {
    this._destroyed = true;
  }

  export(type?: string, quality?: number): string | null {
    if (typeof (this._canvas as any).toDataURL !== 'function') return null;
    try {
      return (this._canvas as any).toDataURL(type, quality);
    } catch {
      return null;
    }
  }

  // ── Node 特定方法 ──

  /** 获取底层 node-canvas 实例 */
  getCanvas(): NodeCanvas {
    return this._canvas;
  }

  /** 导出为 WebP Buffer */
  toWebPBuffer(quality: number = 80): Buffer {
    return (this._canvas as any).toBuffer("image/webp", { quality });
  }

  // ── 内部方法 ──

  private _initContext(): void {
    this._ctx.imageSmoothingEnabled = true;
    this._ctx.imageSmoothingQuality = "high";
  }
}
