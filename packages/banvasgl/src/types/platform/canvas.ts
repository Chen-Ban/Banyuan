/**
 * 平台画布注入接口
 *
 * 每种平台（Web / React Native / Node）实现自己的 IPlatformCanvas，
 * 负责创建绘图上下文和管理画布生命周期。
 *
 * 这是 banvasgl 引擎与具体平台之间的唯一耦合点：
 *   App.create(platform) → App
 *   Renderer(platform) → Renderer
 */

import type { IDrawingContext } from './drawing.js';

/** 平台画布配置选项（平台无关部分） */
export interface IPlatformCanvasOptions {
  enableAntialiasing?: boolean;
  enableImageSmoothing?: boolean;
  backgroundColor?: string;
  clearColor?: string;
  dpr?: number;
}

/** 平台画布注入接口 */
export interface IPlatformCanvas {
  /** 获取主绘图上下文（直接绘制到屏幕） */
  getMainContext(): IDrawingContext;

  /** 获取离屏（双缓冲）绘图上下文 */
  getBufferContext(): IDrawingContext;

  /** 画布物理像素宽度 */
  getWidth(): number;

  /** 画布物理像素高度 */
  getHeight(): number;

  /** 调整画布物理像素尺寸 */
  resize(width: number, height: number): void;

  /** 设备像素比 */
  getDPR(): number;
  setDPR(dpr: number): void;

  /** 清空画布 */
  clear(): void;

  /** 将离屏内容合成到主画布（各平台实现不同） */
  composite(): void;

  /** 保存/恢复上下文状态（用于双缓冲切换） */
  save(): void;
  restore(): void;

  /** 设置变换矩阵 [a, b, c, d, e, f] */
  setTransform(transform: number[]): void;

  /** 追加变换 */
  transform(transform: number[]): void;

  /** 获取画布尺寸 */
  getSize(): { width: number; height: number };

  /** 配置选项 */
  setOptions(options: Partial<IPlatformCanvasOptions>): void;
  getOptions(): IPlatformCanvasOptions;

  /** 抗锯齿开关 */
  setAntialiasingEnabled(enabled: boolean): void;

  /** 背景色 */
  setBackgroundColor(color: string): void;
  setClearColor(color: string): void;

  /** 导出（可选，Web 平台为 toDataURL/toBlob） */
  toDataURL?(type?: string, quality?: number): string;
  toBlob?(
    callback: (blob: unknown) => void,
    type?: string,
    quality?: number,
  ): void;

  /** 销毁资源 */
  destroy(): void;
}
