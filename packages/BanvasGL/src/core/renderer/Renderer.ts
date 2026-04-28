import Scene from "@/core/scene/Scene";
import CanvasContext, {
  getGlobalCanvasContext,
  destroyGlobalCanvasContext,
} from "./CanvasContext";
import { IRendererOptions } from '@/core/interfaces'

export default class Renderer {
  // 渲染状态
  private isRendering: boolean = false;
  private lastRenderTime: number = 0;
  private frameCount: number = 0;
  private fps: number = 0;

  // 设备像素比
  private dpr: number;

  constructor(canvas: HTMLCanvasElement, options: IRendererOptions = {}) {
    // 初始化全局 CanvasContext
    getGlobalCanvasContext(canvas, options);
    // 保存 dpr，默认为 1
    this.dpr = options.dpr ?? 1;
  }

  // 获取全局 CanvasContext 实例
  private get canvasContext(): CanvasContext {
    return getGlobalCanvasContext();
  }

  // 渲染场景
  public render(scene: Scene): void {
    if (this.isRendering) {
      return;
    }

    this.isRendering = true;

    try {
      // 清空画布并渲染场景
      const canvasContext = this.canvasContext;
      if (canvasContext) {
        canvasContext.clear();
        // 在渲染前应用 dpr scale
        const ctx = canvasContext.getMainContext();
        ctx.save();
        ctx.scale(this.dpr, this.dpr);
        scene.render();
        ctx.restore();
      }

      // 更新FPS
      this.updateFPS();
    } catch (error) {
      console.error("Renderer error:", error);
    } finally {
      this.isRendering = false;
    }
  }

  // 清空画布
  public clear(): void {
    this.canvasContext.clear();
  }

  // 更新FPS
  private updateFPS(): void {
    this.frameCount++;
    const currentTime = performance.now();

    if (currentTime - this.lastRenderTime >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastRenderTime));
      this.frameCount = 0;
      this.lastRenderTime = currentTime;
    }
  }

  // 调整画布大小
  public resize(width: number, height: number): void {
    this.canvasContext.resize(width, height);
  }

  // 获取画布尺寸
  public getSize(): { width: number; height: number } {
    return this.canvasContext.getSize();
  }

  // 获取FPS
  public getFPS(): number {
    return this.fps;
  }

  // 设置渲染选项
  public setOptions(options: Partial<IRendererOptions>): void {
    this.canvasContext.setOptions(options);
    if (options.dpr !== undefined) {
      this.dpr = options.dpr;
    }
  }

  // 设置设备像素比
  public setDPR(dpr: number): void {
    this.dpr = dpr;
  }

  // 获取设备像素比
  public getDPR(): number {
    return this.dpr;
  }

  // 获取渲染选项
  public getOptions(): IRendererOptions {
    return this.canvasContext.getOptions();
  }

  // 启用/禁用抗锯齿
  public setAntialiasingEnabled(enabled: boolean): void {
    this.canvasContext.setAntialiasingEnabled(enabled);
  }

  // 设置背景色
  public setBackgroundColor(color: string): void {
    this.canvasContext.setBackgroundColor(color);
  }

  // 设置清除色
  public setClearColor(color: string): void {
    this.canvasContext.setClearColor(color);
  }

  // 获取画布元素
  public getCanvas(): HTMLCanvasElement {
    return this.canvasContext.getMainCanvas();
  }

  // 获取离屏画布元素
  public getBufferCanvas(): HTMLCanvasElement | OffscreenCanvas | null {
    return this.canvasContext.getBufferCanvas();
  }

  // 获取主画布上下文
  public getContext(): CanvasRenderingContext2D {
    return this.canvasContext.getMainContext();
  }

  // 获取离屏画布上下文
  public getBufferContext(): CanvasRenderingContext2D | null {
    return this.canvasContext.getBufferContext();
  }

  // 导出画布为图像
  public toDataURL(type?: string, quality?: number): string {
    return this.canvasContext.toDataURL(type, quality);
  }

  // 导出画布为Blob
  public toBlob(callback: (blob: Blob | null) => void, type?: string, quality?: number): void {
    this.canvasContext.toBlob(callback, type, quality);
  }

  // 销毁渲染器
  public destroy(): void {
    // 清理资源
    destroyGlobalCanvasContext();
    this.isRendering = false;
  }

  // 检查是否正在渲染
  public isCurrentlyRendering(): boolean {
    return this.isRendering;
  }

  // 获取渲染统计信息
  public getStats(): {
    fps: number;
    isRendering: boolean;
    canvasSize: { width: number; height: number };
    hasOffscreen: boolean;
  } {
    return {
      fps: this.fps,
      isRendering: this.isRendering,
      canvasSize: this.getSize(),
      hasOffscreen: this.canvasContext.getBufferContext() !== null,
    };
  }
}
