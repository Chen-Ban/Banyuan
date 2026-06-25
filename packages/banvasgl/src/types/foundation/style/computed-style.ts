/**
 * IComputedStyle —— 计算输出（BoxDecorationAddon.compute() 产出）
 *
 * 设计要点：
 *   - 所有字段均为已计算、已实例化的最终值
 *   - fill / stroke / shadow 为对应 class 实例或 null（表示使用 Graph 自身默认值）
 */

import type FillStyle from '@/foundation/style/FillStyle'
import type StrokeStyle from '@/foundation/style/StrokeStyle'
import type ShadowStyle from '@/foundation/style/ShadowStyle'

export interface IComputedStyle {
  // ── 布局域 ──
  /** overflow 计算值，直通原始值 */
  overflow: 'visible' | 'hidden' | 'scroll'
  /**
   * 滚动偏移（像素值，已 clamp 到合法区间）。
   * overflow !== 'scroll' 时始终为 { x: 0, y: 0 }。
   */
  scrollOffset: { x: number; y: number }

  // ── 容器装饰域 ──
  /** opacity 计算值（0-1） */
  opacity: number
  /** borderRadius 已 normalize 为四元组 [tl, tr, br, bl] */
  borderRadius: [number, number, number, number]
  /** 背景色计算值 */
  backgroundColor: string
  /** 边框宽度计算值（px） */
  borderWidth: number
  /** 边框颜色计算值 */
  borderColor: string
  /** 是否裁剪超出内容 */
  clipContent: boolean

  // ── 图形绘制域 ──
  /**
   * Graph 填充样式（已实例化）。
   * 来源：rawStyle.fill → new FillStyle(options)，未设置时由 Graph.defaultFill() 提供。
   * null 表示「使用 Graph 自身默认值」，由 Graph.render() 内部处理。
   */
  fill: FillStyle | null
  /**
   * Graph 描边样式（已实例化）。
   * null 表示「使用 Graph 自身默认值」。
   */
  stroke: StrokeStyle | null
  /**
   * Graph 阴影样式（已实例化）。
   * null 表示「使用 Graph 自身默认值（通常为无阴影）」。
   */
  shadow: ShadowStyle | null
}
