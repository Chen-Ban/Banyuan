import { Scene } from "@/engine/scene/Scene";
import type { IDrawingSurface } from '@/types/platform/surface.js'

export class Renderer {
  // 渲染状态
  private isRendering: boolean = false;
  private lastRenderTime: number = 0;
  private frameCount: number = 0;
  private fps: number = 0;

  // 每个 Renderer 实例拥有自己的画布表面
  private _surface: IDrawingSurface;

  constructor(surface: IDrawingSurface) {
    this._surface = surface;
  }

  // ── 表面访问 ──

  /** 获取当前画布表面（供 Scene / View 渲染使用） */
  public getSurface(): IDrawingSurface {
    return this._surface;
  }

  // ── 渲染 ──

  public render(scene: Scene): void {
    if (this.isRendering) return;
    this.isRendering = true;

    try {
      const surface = this._surface;
      surface.clear();
      scene.render(surface);

      // 渲染吸附对齐辅助线
      if (scene.snapAlign.overlay.hasContent()) {
        const ctx = surface.main;
        const vpMatrix = scene.camera.viewProjectionMatrix;
        surface.present();
        scene.snapAlign.overlay.render(ctx, vpMatrix, surface.width, surface.height, surface.dpr);
      }
    } catch (error) {
      console.error("Renderer error:", error);
    } finally {
      this.isRendering = false;
    }

    this.updateFPS();
  }

  // ── 画布操作 ──

  public clear(): void {
    this._surface.clear();
  }

  public resize(logicalWidth: number, logicalHeight: number): void {
    this._surface.resize(logicalWidth, logicalHeight);
  }

  public getSize(): { width: number; height: number } {
    return { width: this._surface.width, height: this._surface.height };
  }

  // ── DPR ──

  public setDPR(dpr: number): void {
    this._surface.dpr = dpr;
  }

  public getDPR(): number {
    return this._surface.dpr;
  }

  // ── FPS ──

  public getFPS(): number {
    return this.fps;
  }

  private updateFPS(): void {
    this.frameCount++;
    const currentTime = performance.now();

    if (currentTime - this.lastRenderTime >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastRenderTime));
      this.frameCount = 0;
      this.lastRenderTime = currentTime;
    }
  }

  // ── 生命周期 ──

  public destroy(): void {
    this.isRendering = false;
    this._surface.dispose();
  }

  // ── 状态查询 ──

  public isCurrentlyRendering(): boolean {
    return this.isRendering;
  }

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
      hasOffscreen: this._surface.offscreen !== null,
    };
  }
}
