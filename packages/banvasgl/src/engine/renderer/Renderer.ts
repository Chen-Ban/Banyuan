import { Scene } from "@/engine/scene/Scene";
import type { IRendererOptions } from '@/types/engine/renderer'
import type { IDrawingContext } from '@/types/platform/drawing.js'
import type { IPlatformCanvas } from '@/types/platform/canvas.js'
import type { ICanvasHost } from '@/types/platform/host.js'

export class Renderer {
  // 渲染状态
  private isRendering: boolean = false;
  private lastRenderTime: number = 0;
  private frameCount: number = 0;
  private fps: number = 0;

  // 每个 Renderer 实例拥有自己的画布宿主（不再依赖全局单例）
  private _canvasHost: ICanvasHost;

  // 保留平台画布引用（用于导出等平台特定操作）
  private _platformCanvas: IPlatformCanvas | null = null;

  /**
   * 私有构造：由 fromPlatform 工厂调用
   */
  private constructor(host: ICanvasHost, platform: IPlatformCanvas | null, options: IRendererOptions = {}) {
    this._canvasHost = host;
    this._platformCanvas = platform;
    // dpr 初始值由 platform 注册后 setDPR 设置
  }

  /**
   * 平台无关工厂：从 IPlatformCanvas 创建
   */
  public static fromPlatform(platform: IPlatformCanvas, options: IRendererOptions = {}): Renderer {
    const host = createCanvasHost(platform, options);
    return new Renderer(host, platform, options);
  }

  // 获取当前实例的 CanvasContext（内部 getter，保持兼容）
  private get canvasHost(): ICanvasHost {
    return this._canvasHost;
  }

  /**
   * 获取当前 Renderer 持有的 ICanvasHost 实例
   *
   * 应用层通过此方法获取画布宿主，
   * 然后以参数传入 View.interact / View.render 等核心方法，
   * 从而避免依赖全局状态。
   */
  public getCanvasContext(): ICanvasHost {
    return this._canvasHost;
  }

  // 渲染场景
  public render(scene: Scene): void {
    if (this.isRendering) {
      return;
    }

    this.isRendering = true;

    try {
      // 清空画布并渲染场景
      const host = this.canvasHost;
      if (host) {
        host.clear();
        // dpr 已融入 View 的变换矩阵，不需要在此处 scale
        scene.render(host);

        // 渲染吸附对齐辅助线（VP 输出逻辑坐标，需乘 dpr 映射到物理像素）
        if (scene.snapAlign.overlay.hasContent()) {
          const ctx = host.getMainContext();
          const vpMatrix = scene.camera.viewProjectionMatrix;
          const { width, height } = host.getSize();
          scene.snapAlign.overlay.render(ctx, vpMatrix, width, height, host.dpr);
        }
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
    this.canvasHost.clear();
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

  // 调整画布尺寸（逻辑像素，dpr 由平台层内部处理）
  public resize(logicalWidth: number, logicalHeight: number): void {
    this._canvasHost.resize(logicalWidth, logicalHeight);
  }

  // 获取画布尺寸
  public getSize(): { width: number; height: number } {
    return this.canvasHost.getSize();
  }

  // 获取FPS
  public getFPS(): number {
    return this.fps;
  }

  // 设置渲染选项
  public setOptions(options: Partial<IRendererOptions>): void {
    this.canvasHost.setOptions(options);
  }

  // 设置设备像素比
  public setDPR(dpr: number): void {
    this._canvasHost.setDPR(dpr);
  }

  // 获取设备像素比
  public getDPR(): number {
    return this._canvasHost.dpr;
  }

  // 获取渲染选项
  public getOptions(): IRendererOptions {
    return this.canvasHost.getOptions();
  }

  // 启用/禁用抗锯齿
  public setAntialiasingEnabled(enabled: boolean): void {
    this.canvasHost.setAntialiasingEnabled(enabled);
  }

  // 设置背景色
  public setBackgroundColor(color: string): void {
    this.canvasHost.setBackgroundColor(color);
  }

  // 设置清除色
  public setClearColor(color: string): void {
    this.canvasHost.setClearColor(color);
  }

  // 获取主画布上下文
  public getContext(): IDrawingContext {
    return this.canvasHost.getMainContext();
  }

  // 获取离屏画布上下文
  public getBufferContext(): IDrawingContext | null {
    return this.canvasHost.getBufferContext();
  }

  // 平台画布访问
  public getPlatformCanvas(): IPlatformCanvas | null {
    return this._platformCanvas;
  }

  // 销毁渲染器
  public destroy(): void {
    // 清理资源（实例级别，不影响其他 Renderer）
    this.isRendering = false;
    this._platformCanvas?.destroy();
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
      hasOffscreen: this.canvasHost.getBufferContext() !== null,
    };
  }
}

/**
 * 将 IPlatformCanvas 适配为 ICanvasHost
 *
 * 这是一个内部适配器，桥接平台画布接口与引擎宿主接口。
 * 每个平台（Web / Skia / Node）通过 IPlatformCanvas 注入，
 * 此适配器将其包装为引擎内统一的 ICanvasHost。
 */
function createCanvasHost(
  platform: IPlatformCanvas,
  options: IRendererOptions,
): ICanvasHost {
  return {
    mainCtx: platform.getMainContext(),
    bufferCtx: platform.getBufferContext(),

    get dpr(): number {
      return platform.getDPR();
    },

    save(): void { platform.save(); },
    restore(): void { platform.restore(); },

    setTransform(transform: number[]): void {
      platform.setTransform(transform);
    },
    transform(transform: number[]): void {
      platform.transform(transform);
    },

    clear(): void { platform.clear(); },
    resize(width: number, height: number): void { platform.resize(width, height); },
    getSize(): { width: number; height: number } {
      return platform.getSize();
    },

    getMainContext(): IDrawingContext { return platform.getMainContext(); },
    getBufferContext(): IDrawingContext { return platform.getBufferContext(); },

    setOptions(opts: Partial<IRendererOptions>): void { platform.setOptions(opts); },
    getOptions(): IRendererOptions { return platform.getOptions(); },

    setAntialiasingEnabled(enabled: boolean): void {
      platform.setAntialiasingEnabled(enabled);
    },
    setBackgroundColor(color: string): void { platform.setBackgroundColor(color); },
    setClearColor(color: string): void { platform.setClearColor(color); },

    composite(): void { platform.composite(); },

    setDPR(dpr: number): void { platform.setDPR(dpr); },
  };
}
