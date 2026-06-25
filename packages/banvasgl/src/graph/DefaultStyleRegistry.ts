/**
 * 全局默认样式注册表
 *
 * 为每种 GraphType 提供默认样式工厂函数。
 * Graph 不再持有 style 属性，渲染时由 View 层从此注册表获取默认样式，
 * 再与 computedStyle 合并后传入 graph.render(ctx, style)。
 *
 * 设计要点：
 *   - 工厂函数每次返回新实例，避免共享引用导致的副作用
 *   - 支持外部注册/覆盖默认样式（如业务层自定义图形类型）
 *   - 未注册的类型回退到 Style.DEFAULT
 */

import { GraphType } from '@/foundation/constants'
import Style from '@/foundation/style/Style'

/** 默认样式工厂函数类型 */
export type DefaultStyleFactory = () => Style

/** 注册表：GraphType → 工厂函数 */
const registry = new Map<string, DefaultStyleFactory>()

/**
 * 注册指定图形类型的默认样式工厂函数。
 *
 * @param graphType - 图形类型标识
 * @param factory - 返回 Style 实例的工厂函数
 *
 * @example
 * ```ts
 * registerDefaultStyle(GraphType.LINE, () => Style.STROKE_ONLY)
 * ```
 */
export function registerDefaultStyle(graphType: string, factory: DefaultStyleFactory): void {
  registry.set(graphType, factory)
}

/**
 * 获取指定图形类型的默认样式。
 *
 * 若该类型已注册工厂函数，调用工厂函数返回新实例；
 * 否则回退到 Style.DEFAULT。
 *
 * @param graphType - 图形类型标识
 * @returns 默认样式实例
 *
 * @example
 * ```ts
 * const style = getDefaultStyle(GraphType.RECTANGLE)
 * graph.render(ctx, style)
 * ```
 */
export function getDefaultStyle(graphType: string): Style {
  const factory = registry.get(graphType)
  return factory ? factory() : Style.DEFAULT
}

// ── 内置默认样式注册 ──

// 解析几何图形：默认仅描边（黑色 1px）
registerDefaultStyle(GraphType.LINE, () => Style.STROKE_ONLY.copy())
registerDefaultStyle(GraphType.ARC, () => Style.STROKE_ONLY.copy())
registerDefaultStyle(GraphType.CIRCLE, () => Style.STROKE_ONLY.copy())
registerDefaultStyle(GraphType.BEZIER, () => Style.STROKE_ONLY.copy())
registerDefaultStyle(GraphType.QUADRATIC_BEZIER, () => Style.STROKE_ONLY.copy())
registerDefaultStyle(GraphType.CUBIC_BEZIER, () => Style.STROKE_ONLY.copy())

// 组合图形：默认填充+描边
registerDefaultStyle(GraphType.COMBINED_GRAPH, () => Style.FILL_AND_STROKE.copy())
registerDefaultStyle(GraphType.POLYGON, () => Style.FILL_AND_STROKE.copy())
registerDefaultStyle(GraphType.TRIANGLE, () => Style.FILL_AND_STROKE.copy())
registerDefaultStyle(GraphType.QUADRILATERAL, () => Style.FILL_AND_STROKE.copy())
registerDefaultStyle(GraphType.RECTANGLE, () => Style.FILL_AND_STROKE.copy())
registerDefaultStyle(GraphType.REGULAR_POLYGON, () => Style.FILL_AND_STROKE.copy())
registerDefaultStyle(GraphType.ROUNDED_RECT, () => Style.FILL_AND_STROKE.copy())

// 轨迹：仅描边
registerDefaultStyle(GraphType.DENSETRAJECTORY, () => Style.STROKE_ONLY.copy())

// 媒体元素：无样式（图片/视频自身渲染）
registerDefaultStyle(GraphType.IMAGE, () => Style.DEFAULT.copy())
registerDefaultStyle(GraphType.VIDEO, () => Style.DEFAULT.copy())

// 文本元素：默认样式（文字颜色由 TextOptions 控制）
registerDefaultStyle(GraphType.TEXTFIELDS, () => Style.DEFAULT.copy())
registerDefaultStyle(GraphType.TEXTPARAGRAPH, () => Style.DEFAULT.copy())
registerDefaultStyle(GraphType.TEXTELEMENT, () => Style.DEFAULT.copy())
registerDefaultStyle(GraphType.PRINTABLE_TEXTELEMENT, () => Style.DEFAULT.copy())
registerDefaultStyle(GraphType.NONPRINTABLE_TEXTELEMENT, () => Style.DEFAULT.copy())
