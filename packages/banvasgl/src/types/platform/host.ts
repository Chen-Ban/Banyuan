/**
 * ICanvasHost — 画布宿主接口（引擎内部使用）
 *
 * 这是原 CanvasContext 具体类的接口契约提取。
 * View / Scene / Renderer 通过此接口访问画布上下文，
 * 不再依赖平台特定的 HTMLCanvasElement / OffscreenCanvas。
 *
 * ICanvasHost 是对 IPlatformCanvas 的引擎内封装，
 * 增加了双缓冲管理、DPR 缩放等引擎层关注点。
 */

import type { IDrawingContext } from './drawing.js';
import type {
  IPlatformCanvasOptions,
} from './canvas.js';

/** CanvasHost 配置选项（复用 IPlatformCanvasOptions） */
export type ICanvasHostOptions = IPlatformCanvasOptions;

/**
 * 画布宿主接口
 *
 * 每个 Renderer 实例持有一个 ICanvasHost，
 * 由平台层注入（Web 平台基于 HTMLCanvasElement 实现）。
 */
export interface ICanvasHost {
  /** 主画布绘图上下文 */
  readonly mainCtx: IDrawingContext;

  /** 离屏（双缓冲）绘图上下文 */
  readonly bufferCtx: IDrawingContext;

  /** 设备像素比 */
  get dpr(): number;

  // ── 上下文状态管理 ──
  save(): void;
  restore(): void;
  setTransform(transform: number[]): void;
  transform(transform: number[]): void;

  // ── 画布操作 ──
  clear(): void;
  resize(width: number, height: number): void;
  getSize(): { width: number; height: number };

  // ── 上下文访问 ──
  getMainContext(): IDrawingContext;
  getBufferContext(): IDrawingContext;

  // ── 选项管理 ──
  setOptions(options: Partial<ICanvasHostOptions>): void;
  getOptions(): ICanvasHostOptions;
  setAntialiasingEnabled(enabled: boolean): void;
  setBackgroundColor(color: string): void;
  setClearColor(color: string): void;

  // ── 双缓冲合成 ──
  /**
   * 将离屏缓冲区合成到主画布
   *
   * 各平台实现不同的合成策略：
   *   - Web: transferToImageBitmap → drawImage
   *   - Skia: 直接 blit
   *   - Node: canvas.copyFromBuffer
   */
  composite(): void;

  // ── DPR ──
  setDPR(dpr: number): void;
}
