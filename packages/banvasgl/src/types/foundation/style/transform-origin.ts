/**
 * 变换原点类型
 *
 * 独立成文件的原因：
 *   - 被 IViewStyle 和 IComputedStyle 引用
 *   - 同时被 view.ts 通过 style barrel 重导出
 */

import type { Point3 } from '@/foundation/math'

/**
 * 变换原点关键字
 *
 * - 'center': 视口中心（默认）
 * - 'topLeft': 视口左上角
 * - 'top': 视口上边中点
 * - 'topRight': 视口右上角
 * - 'left': 视口左边中点
 * - 'right': 视口右边中点
 * - 'bottomLeft': 视口左下角
 * - 'bottom': 视口下边中点
 * - 'bottomRight': 视口右下角
 */
export type TransformOriginKeyword =
  | 'center'
  | 'topLeft'
  | 'top'
  | 'topRight'
  | 'left'
  | 'right'
  | 'bottomLeft'
  | 'bottom'
  | 'bottomRight'

/** 变换原点：可以是关键字或自定义坐标点 */
export type TransformOrigin = TransformOriginKeyword | Point3
