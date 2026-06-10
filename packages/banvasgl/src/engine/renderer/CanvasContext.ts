import type { ICanvasContextOptions } from '@/types/engine/renderer'

class CanvasContext {
  // 画布上下文
  public readonly mainCtx: CanvasRenderingContext2D;
  public bufferCtx: CanvasRenderingContext2D;

  // 画布元素
  private readonly mainCanvas: HTMLCanvasElement;
  // bufferCanvas 使用离屏 canvas（OffscreenCanvas）
  private bufferCanvas: OffscreenCanvas;

  // 设备像素比（用于渲染时将逻辑坐标映射到物理像素）
  private _dpr: number = 1;

  // 选项
  private readonly options: ICanvasContextOptions;

  constructor(mainCanvas: HTMLCanvasElement, options: ICanvasContextOptions = {}) {
    this.mainCanvas = mainCanvas;
    const ctx = mainCanvas.getContext("2d");

    if (!ctx) {
      throw new Error("Failed to get 2D rendering context from main canvas");
    }
    this.mainCtx = ctx;

    this.options = {
      enableAntialiasing: true,
      enableImageSmoothing: true,
      backgroundColor: "transparent",
      clearColor: "#000000",
      ...options,
    };

    // 创建离屏画布
    const bufferCanvas = this.createCanvas();
    // 统一设置尺寸（OffscreenCanvas 与 HTMLCanvasElement 都支持 width/height）
    bufferCanvas.width = this.mainCanvas.width;
    bufferCanvas.height = this.mainCanvas.height;

    // OffscreenCanvas.getContext 返回 OffscreenCanvasRenderingContext2D，这里做一次统一类型断言
    const bufferCtx = bufferCanvas.getContext("2d") as CanvasRenderingContext2D
    if (!bufferCtx) {
      throw new Error("缓冲区上下文初始化失败");
    }
    this.bufferCanvas = bufferCanvas;
    this.bufferCtx = bufferCtx;

    this.initializeContexts();
  }

  public save() {
    this.mainCtx.save();
    this.bufferCtx?.save();
  }

  public restore() {
    this.mainCtx.restore();
    this.bufferCtx?.restore();
  }

  public setTransform(transform: number[]) {
    const [a, b, c, d, e, f] = transform;
    this.mainCtx.setTransform(a, b, c, d, e, f);
    this.bufferCtx?.setTransform(a, b, c, d, e, f);
  }

  public transform(transform: number[]) {
    const [a, b, c, d, e, f] = transform;
    this.mainCtx.transform(a, b, c, d, e, f);
    this.bufferCtx?.transform(a, b, c, d, e, f);
  }

  // 初始化上下文
  private initializeContexts(): void {
    // 设置主画布样式
    this.setupContext(this.mainCtx);

    // 设置离屏画布样式
    if (this.bufferCtx) {
      this.setupContext(this.bufferCtx);
    }
  }

  // 设置画布上下文样式
  private setupContext(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): void {
    // 启用抗锯齿
    if (this.options.enableAntialiasing) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
    }

    // 设置图像平滑
    if (this.options.enableImageSmoothing) {
      ctx.imageSmoothingEnabled = true;
    }

    // 设置默认样式
    ctx.fillStyle = this.options.backgroundColor || "transparent";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1;
  }

  // 跨环境创建画布，优先使用 OffscreenCanvas 作为离屏画布
  private createCanvas(): any {
    // 浏览器环境优先使用 OffscreenCanvas
    if (typeof OffscreenCanvas !== "undefined") {
      return new OffscreenCanvas(this.mainCanvas.width, this.mainCanvas.height);
    }

    // Node.js 环境 (需要安装 canvas 包)
    if (typeof (globalThis as any).require !== "undefined") {
      try {
        const { createCanvas } = (globalThis as any).require("canvas");
        return createCanvas(this.mainCanvas.width, this.mainCanvas.height);
      } catch (e) {
        console.warn("Canvas package not found. Install with: npm install -g canvas");
      }
    }

    // 如果都不支持，抛出错误
    throw new Error("Canvas creation not supported in this environment");
  }

  // 清空画布
  public clear(): void {
    this.mainCtx.clearRect(0, 0, this.mainCanvas.width, this.mainCanvas.height);

    // 如果设置了背景色，填充背景
    if (this.options.clearColor && this.options.clearColor !== "transparent") {
      this.mainCtx.fillStyle = this.options.clearColor;
      this.mainCtx.fillRect(0, 0, this.mainCanvas.width, this.mainCanvas.height);
    }

    // 清空离屏画布
    if (this.bufferCtx && this.bufferCanvas) {
      this.bufferCtx.clearRect(0, 0, this.bufferCanvas.width, this.bufferCanvas.height);
    }
  }

  // 调整画布物理像素尺寸
  // 引擎只关心虚拟尺寸（物理像素），CSS 样式尺寸（显示多大）由外层控制
  public resize(width: number, height: number): void {
    this.mainCanvas.width = width;
    this.mainCanvas.height = height;

    if (this.bufferCanvas) {
      this.bufferCanvas.width = width;
      this.bufferCanvas.height = height;
    }
  }

  // 获取画布尺寸
  public getSize(): { width: number; height: number } {
    return {
      width: this.mainCanvas.width,
      height: this.mainCanvas.height,
    };
  }

  // 获取主画布元素
  public getMainCanvas(): HTMLCanvasElement {
    return this.mainCanvas;
  }

  // 获取离屏画布元素
  public getBufferCanvas(): OffscreenCanvas {
    return this.bufferCanvas;
  }

  // 获取主画布上下文
  public getMainContext(): CanvasRenderingContext2D {
    return this.mainCtx;
  }

  // 获取离屏画布上下文
  public getBufferContext(): CanvasRenderingContext2D {
    return this.bufferCtx;
  }

  // ── DPR ──

  get dpr(): number { return this._dpr; }

  setDPR(dpr: number): void { this._dpr = dpr; }

  // 设置选项
  public setOptions(options: Partial<ICanvasContextOptions>): void {
    Object.assign(this.options, options);
    this.initializeContexts();
  }

  // 获取选项
  public getOptions(): ICanvasContextOptions {
    return { ...this.options };
  }

  // 启用/禁用抗锯齿
  public setAntialiasingEnabled(enabled: boolean): void {
    this.options.enableAntialiasing = enabled;
    this.mainCtx.imageSmoothingEnabled = enabled;

    if (this.bufferCtx) {
      this.bufferCtx.imageSmoothingEnabled = enabled;
    }
  }

  // 设置背景色
  public setBackgroundColor(color: string): void {
    this.options.backgroundColor = color;
    this.options.clearColor = color;
  }

  // 设置清除色
  public setClearColor(color: string): void {
    this.options.clearColor = color;
  }

  // 导出画布为图像
  public toDataURL(type?: string, quality?: number): string {
    return this.mainCanvas.toDataURL(type, quality);
  }

  // 导出画布为Blob
  public toBlob(callback: (blob: Blob | null) => void, type?: string, quality?: number): void {
    this.mainCanvas.toBlob(callback, type, quality);
  }
}

/**
 * 创建 CanvasContext 实例（每个 App/Renderer 持有自己独立的实例）
 * @param mainCanvas 主画布元素
 * @param options 配置选项
 * @returns 新的 CanvasContext 实例
 */
export function createCanvasContext(
  mainCanvas: HTMLCanvasElement,
  options: ICanvasContextOptions = {}
): CanvasContext {
  return new CanvasContext(mainCanvas, options);
}

// 导出类定义
export { CanvasContext };
