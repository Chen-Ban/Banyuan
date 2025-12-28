export interface CanvasContextOptions {
  enableOffscreen?: boolean;
  enableAntialiasing?: boolean;
  enableImageSmoothing?: boolean;
  backgroundColor?: string;
  clearColor?: string;
}

class CanvasContext {
  // 画布上下文
  public readonly mainCtx: CanvasRenderingContext2D;
  public bufferCtx: CanvasRenderingContext2D | null;

  // 画布元素
  private readonly mainCanvas: HTMLCanvasElement;
  private bufferCanvas: HTMLCanvasElement | null;

  // 选项
  private readonly options: CanvasContextOptions;

  constructor(mainCanvas: HTMLCanvasElement, options: CanvasContextOptions = {}) {
    this.mainCanvas = mainCanvas;
    const ctx = mainCanvas.getContext("2d");

    if (!ctx) {
      throw new Error("Failed to get 2D rendering context from main canvas");
    }
    this.mainCtx = ctx;

    this.options = {
      enableOffscreen: true,
      enableAntialiasing: true,
      enableImageSmoothing: true,
      backgroundColor: "transparent",
      clearColor: "#000000",
      ...options,
    };

    // 创建离屏画布
    if (this.options.enableOffscreen) {
      this.bufferCanvas = this.createCanvas();
      this.bufferCanvas.width = this.mainCanvas.width;
      this.bufferCanvas.height = this.mainCanvas.height;
      this.bufferCtx = this.bufferCanvas.getContext("2d");
      if (!this.bufferCtx) throw new Error("缓冲区上下文初始化失败");
    } else {
      this.bufferCanvas = null;
      this.bufferCtx = null;
    }

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
  private setupContext(ctx: CanvasRenderingContext2D): void {
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

  // 跨环境创建画布
  private createCanvas(): HTMLCanvasElement {
    // 浏览器环境
    if (typeof document !== "undefined") {
      return document.createElement("canvas");
    }

    // Node.js 环境 (需要安装 canvas 包)
    if (typeof (globalThis as any).require !== "undefined") {
      try {
        const { createCanvas } = (globalThis as any).require("canvas");
        return createCanvas(this.mainCanvas.width, this.mainCanvas.height);
      } catch (e) {
        console.warn("Canvas package not found. Install with: npm install canvas");
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

  // 调整画布大小
  public resize(width: number, height: number): void {
    // 设置主画布尺寸
    this.mainCanvas.width = width;
    this.mainCanvas.height = height;

    // 设置离屏画布尺寸
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
  public getBufferCanvas(): HTMLCanvasElement | null {
    return this.bufferCanvas;
  }

  // 获取主画布上下文
  public getMainContext(): CanvasRenderingContext2D {
    return this.mainCtx;
  }

  // 获取离屏画布上下文
  public getBufferContext(): CanvasRenderingContext2D | null {
    return this.bufferCtx;
  }

  // 设置选项
  public setOptions(options: Partial<CanvasContextOptions>): void {
    Object.assign(this.options, options);
    this.initializeContexts();
  }

  // 获取选项
  public getOptions(): CanvasContextOptions {
    return { ...this.options };
  }

  // 启用/禁用离屏渲染
  public setOffscreenEnabled(enabled: boolean): void {
    this.options.enableOffscreen = enabled;

    if (enabled && !this.bufferCtx) {
      this.bufferCanvas = this.createCanvas();
      this.bufferCanvas.width = this.mainCanvas.width;
      this.bufferCanvas.height = this.mainCanvas.height;
      this.bufferCtx = this.bufferCanvas.getContext("2d")!;
      this.setupContext(this.bufferCtx);
    } else if (!enabled && this.bufferCtx) {
      this.bufferCanvas = null;
      this.bufferCtx = null;
    }
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

  // 销毁画布上下文
  public destroy(): void {
    // 清理资源
    if (this.bufferCanvas) {
      this.bufferCanvas = null;
    }
    if (this.bufferCtx) {
      this.bufferCtx = null;
    }
  }
}

// 全局单例实例
let globalCanvasContext: CanvasContext | null = null;

/**
 * 初始化全局 CanvasContext 实例
 * @param mainCanvas 主画布元素
 * @param options 配置选项
 * @returns CanvasContext 实例
 */
export function getGlobalCanvasContext(
  mainCanvas: HTMLCanvasElement = document.createElement("canvas"),
  options: CanvasContextOptions = {}
): CanvasContext {
  if (!globalCanvasContext) {
    globalCanvasContext = new CanvasContext(mainCanvas, options);
    return globalCanvasContext;
  }
  return globalCanvasContext;
}

/**
 * 销毁全局 CanvasContext 实例
 */
export function destroyGlobalCanvasContext(): void {
  if (globalCanvasContext) {
    globalCanvasContext.destroy();
    globalCanvasContext = null;
  }
}

/**
 * 检查全局 CanvasContext 是否已初始化
 * @returns 是否已初始化
 */
export function isGlobalCanvasContextInitialized(): boolean {
  return globalCanvasContext !== null;
}

// 导出类定义
export default CanvasContext;
