/**
 * IDrawingSurface — 画布表面注入接口
 *
 * 引擎通过此接口获取绘制表面，不关心底层平台（Web / Skia / Node）的具体实现。
 * 每个平台实现自己的 DrawingSurface，封装 DOM 元素 / Context 创建等平台细节。
 *
 * 这是 banvasgl 引擎与具体平台之间的唯一耦合点：
 *   App.create(surface, options) → App
 */

import type { IDrawingContext } from './drawing.js';

/**
 * 平台注入的画布表面
 *
 * 持有主上下文和离屏上下文，管理尺寸、DPR、双缓冲合成和生命周期。
 * 引擎通过此接口进行所有画布级操作，不再感知平台特定 API。
 */
export interface IDrawingSurface {
  /** 主绘图上下文（直接绘制到屏幕） */
  readonly main: IDrawingContext;

  /** 离屏双缓冲上下文 */
  readonly offscreen: IDrawingContext;

  /** 画布物理像素宽度 */
  readonly width: number;

  /** 画布物理像素高度 */
  readonly height: number;

  /** 设备像素比（可读写） */
  dpr: number;

  /** 调整画布逻辑尺寸（内部 × dpr 得到物理像素） */
  resize(logicalWidth: number, logicalHeight: number): void;

  /** 清空主画布和离屏缓冲区 */
  clear(): void;

  /** 将离屏缓冲区合成到主画布 */
  present(): void;

  /** 销毁资源 */
  dispose(): void;

  /**
   * 导出为图片（可选，Web 平台为 toDataURL）
   *
   * 非 Web 平台可返回 null 或不实现。
   */
  export?(type?: string, quality?: number): string | null;
}
