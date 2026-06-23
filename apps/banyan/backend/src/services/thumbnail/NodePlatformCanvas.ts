/**
 * NodePlatformCanvas — IPlatformCanvas 的 Node.js (node-canvas) 实现
 *
 * 基于单个 node-canvas 实例，主/缓冲上下文复用同一画布。
 * 用于服务端缩略图生成，无需双缓冲。
 *
 * 注：node-canvas 模块通过动态 import 加载，类型定义使用 any 规避编译期依赖。
 */

import type { IPlatformCanvas, IPlatformCanvasOptions, IPlatformDrawingContext } from "@banyuan/banvasgl";
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

export class NodePlatformCanvas implements IPlatformCanvas {
  private _canvas: NodeCanvas;
  private _ctx: NodeCanvasCtx;
  private _drawing: NodeDrawingContext;
  private _dpr: number;
  private _options: IPlatformCanvasOptions;
  private _destroyed: boolean = false;

  constructor(width: number, height: number, options: IPlatformCanvasOptions = {}) {
    this._options = {
      enableAntialiasing: true,
      enableImageSmoothing: true,
      backgroundColor: "#ffffff",
      clearColor: "#ffffff",
      ...options,
    };

    const createCanvas = getCreateCanvas();
    this._canvas = createCanvas(width, height);
    this._ctx = this._canvas.getContext("2d");
    this._drawing = new NodeDrawingContext(this._ctx, this._canvas);
    this._dpr = 1; // 服务端渲染使用 1x

    this._initContext();
  }

  // ── IPlatformCanvas 实现 ──

  resize(width: number, height: number): void {
    if (this._destroyed) return;
    if (this._canvas.width === width && this._canvas.height === height) return;
    this._canvas.width = width;
    this._canvas.height = height;
    this._initContext();
  }

  getDPR(): number {
    return this._dpr;
  }

  setDPR(dpr: number): void {
    this._dpr = dpr;
  }

  /**
   * 合成离屏缓冲到主画布。
   * 单画布模式下为 no-op（绘制直接在主画布上进行）。
   */
  composite(): void {
    // 单画布模式，无需合成
  }

  getSize(): { width: number; height: number } {
    return { width: this._canvas.width, height: this._canvas.height };
  }

  setOptions(options: Partial<IPlatformCanvasOptions>): void {
    Object.assign(this._options, options);
    this._initContext();
  }

  getOptions(): IPlatformCanvasOptions {
    return { ...this._options };
  }

  setAntialiasingEnabled(enabled: boolean): void {
    this._options.enableAntialiasing = enabled;
    this._ctx.imageSmoothingEnabled = enabled;
  }

  setBackgroundColor(color: string): void {
    this._options.backgroundColor = color;
  }

  setClearColor(color: string): void {
    this._options.clearColor = color;
  }

  destroy(): void {
    this._destroyed = true;
  }

  // ── 上下文访问 ──

  getMainContext(): IPlatformDrawingContext {
    return this._drawing;
  }

  /**
   * 获取离屏绘图上下文。
   * 单画布模式下返回与主上下文相同的实例。
   */
  getBufferContext(): IPlatformDrawingContext {
    return this._drawing;
  }

  // ── Node 特定方法 ──

  /** 获取底层 node-canvas 实例（用于 toBuffer 等） */
  getCanvas(): NodeCanvas {
    return this._canvas;
  }

  /** 导出为 WebP Buffer */
  toWebPBuffer(quality: number = 80): Buffer {
    return (this._canvas as any).toBuffer("image/webp", { quality });
  }

  // ── 内部方法 ──

  private _initContext(): void {
    if (this._options.enableAntialiasing || this._options.enableImageSmoothing) {
      this._ctx.imageSmoothingEnabled = true;
      this._ctx.imageSmoothingQuality = "high";
    }
  }
}
