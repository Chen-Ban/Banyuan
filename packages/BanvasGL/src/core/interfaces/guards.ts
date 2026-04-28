/**
 * 统一类型守卫 —— 基于接口的判别联合
 *
 * 两种泛型守卫函数：
 *   isGraphType<T>(graph, type)  —— 通过 GRAPHTYPE 枚举判别，收窄为对应接口
 *   isViewType<T>(view, type)    —— 通过 VIEWTYPE 枚举判别，收窄为对应接口
 *
 * 原理：
 *   const enum 值在编译时内联，守卫函数只依赖 `type` 字段与枚举值的 === 比较，
 *   不引入任何具体 class，因此不会产生循环依赖。
 */

import { GRAPHTYPE, VIEWTYPE, ADDONTYPE } from '@/core/constants'
import type { IGraph, GraphTypeMap } from './IGraph'
import type { IView, ViewTypeMap, IViewAddon, IBoundingBoxAddon, IVertexAddon } from './IView'

// ────────────────────────────────────────────
//  Graph 类型守卫
// ────────────────────────────────────────────

/**
 * 统一的 Graph 类型守卫
 *
 * @example
 *   if (isGraphType(graph, GRAPHTYPE.LINE)) {
 *       // graph 被收窄为 ILine
 *       console.log(graph.startPoint, graph.endPoint)
 *   }
 */
export function isGraphType<T extends keyof GraphTypeMap>(
    graph: IGraph,
    type: T
): graph is GraphTypeMap[T] {
    return graph.type === type
}

// ────────────────────────────────────────────
//  View 类型守卫
// ────────────────────────────────────────────

/**
 * 统一的 View 类型守卫
 *
 * @example
 *   if (isViewType(view, VIEWTYPE.TEXTVIEW)) {
 *       // view 被收窄为 ITextView
 *       view.input('hello', false)
 *   }
 */
export function isViewType<T extends keyof ViewTypeMap>(
    view: IView,
    type: T
): view is ViewTypeMap[T] {
    return view.type === type
}

// ────────────────────────────────────────────
//  便捷守卫（高频使用的快捷方式）
// ────────────────────────────────────────────

/** 快捷判断：是否为 CombinedGraph（含 Polygon 等子类） */
export function isCombinedGraph(graph: IGraph): graph is GraphTypeMap[GRAPHTYPE.COMBINED_GRAPH] {
    return (
        graph.type === GRAPHTYPE.COMBINED_GRAPH ||
        graph.type === GRAPHTYPE.POLYGON ||
        graph.type === GRAPHTYPE.TRIANGLE ||
        graph.type === GRAPHTYPE.RECTANGLE ||
        graph.type === GRAPHTYPE.REGULAR_POLYGON
    )
}

/** 快捷判断：是否为 AnalyticGraph（含所有解析子类） */
export function isAnalyticGraph(graph: IGraph): graph is GraphTypeMap[GRAPHTYPE.ANALYTICGRAPH] {
    return (
        graph.type === GRAPHTYPE.ANALYTICGRAPH ||
        graph.type === GRAPHTYPE.LINE ||
        graph.type === GRAPHTYPE.ARC ||
        graph.type === GRAPHTYPE.CIRCLE ||
        graph.type === GRAPHTYPE.BEZIER ||
        graph.type === GRAPHTYPE.QUADRATIC_BEZIER ||
        graph.type === GRAPHTYPE.CUBIC_BEZIER
    )
}

/** 快捷判断：是否为 MediaElement（Image 或 Video） */
export function isMediaElement(graph: IGraph): graph is GraphTypeMap[GRAPHTYPE.IMAGE] | GraphTypeMap[GRAPHTYPE.VIDEO] {
    return graph.type === GRAPHTYPE.IMAGE || graph.type === GRAPHTYPE.VIDEO
}

/** 快捷判断：是否为 TextView */
export function isTextView(view: IView | null | undefined): view is ViewTypeMap[VIEWTYPE.TEXTVIEW] {
    return !!view && view.type === VIEWTYPE.TEXTVIEW
}

/** 快捷判断：是否为 SelectBoxView */
export function isSelectBoxView(view: IView | null | undefined): view is ViewTypeMap[VIEWTYPE.SELECTBOXVIEW] {
    return !!view && view.type === VIEWTYPE.SELECTBOXVIEW
}

/** 快捷判断：是否为 CombinedView */
export function isCombinedView(view: IView | null | undefined): view is ViewTypeMap[VIEWTYPE.COMBINEDVIEW] {
    return !!view && view.type === VIEWTYPE.COMBINEDVIEW
}

// ────────────────────────────────────────────
//  Addon 类型守卫
// ────────────────────────────────────────────

/** 快捷判断：是否为 BoundingBoxAddon */
export function isBoundingBoxAddon(addon: IViewAddon | null | undefined): addon is IBoundingBoxAddon {
    return !!addon && addon.type === ADDONTYPE.BOUNDING_BOX
}

/** 快捷判断：是否为 VertexAddon */
export function isVertexAddon(addon: IViewAddon | null | undefined): addon is IVertexAddon {
    return !!addon && addon.type === ADDONTYPE.VERTEX
}
