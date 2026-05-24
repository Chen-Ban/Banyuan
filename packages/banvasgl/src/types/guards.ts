/**
 * 统一类型守卫 —— 基于接口的判别联合
 *
 * 两种泛型守卫函数：
 *   isGraphType<T>(graph, type)  —— 通过 GraphType 枚举判别，收窄为对应接口
 *   isViewType<T>(view, type)    —— 通过 ViewType 枚举判别，收窄为对应接口
 *
 * 原理：
 *   const enum 值在编译时内联，守卫函数只依赖 `type` 字段与枚举值的 === 比较，
 *   不引入任何具体 class，因此不会产生循环依赖。
 */

import { GraphType, ViewType, AddonType } from '@/foundation/constants'
import type { IGraph, GraphTypeMap } from './graph'
import type { IView, IContainerView, ViewTypeMap, IViewAddon, IBoundingBoxAddon, IVertexAddon, IBoxDecorationAddon, IPortView, INodeView, IEdgeView } from './view'

// ────────────────────────────────────────────
//  Graph 类型守卫
// ────────────────────────────────────────────

/**
 * 统一的 Graph 类型守卫
 *
 * @example
 *   if (isGraphType(graph, GraphType.LINE)) {
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
 *   if (isViewType(view, ViewType.TEXTVIEW)) {
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

/** 快捷判断：是否为 CombinedGraph（含所有组合子类） */
export function isCombinedGraph(graph: IGraph): graph is GraphTypeMap[GraphType.COMBINED_GRAPH] {
    return (
        graph.type === GraphType.COMBINED_GRAPH ||
        graph.type === GraphType.POLYGON ||
        graph.type === GraphType.TRIANGLE ||
        graph.type === GraphType.QUADRILATERAL ||
        graph.type === GraphType.RECTANGLE ||
        graph.type === GraphType.REGULAR_POLYGON ||
        graph.type === GraphType.ROUNDED_RECT
    )
}

/** 快捷判断：是否为 AnalyticGraph（含所有解析子类） */
export function isAnalyticGraph(graph: IGraph): graph is GraphTypeMap[GraphType.ANALYTICGRAPH] {
    return (
        graph.type === GraphType.ANALYTICGRAPH ||
        graph.type === GraphType.LINE ||
        graph.type === GraphType.ARC ||
        graph.type === GraphType.CIRCLE ||
        graph.type === GraphType.BEZIER ||
        graph.type === GraphType.QUADRATIC_BEZIER ||
        graph.type === GraphType.CUBIC_BEZIER
    )
}

/** 快捷判断：是否为 MediaElement（Image 或 Video） */
export function isMediaElement(graph: IGraph): graph is GraphTypeMap[GraphType.IMAGE] | GraphTypeMap[GraphType.VIDEO] {
    return graph.type === GraphType.IMAGE || graph.type === GraphType.VIDEO
}

/** 快捷判断：是否为 TextView */
export function isTextView(view: IView | null | undefined): view is ViewTypeMap[typeof ViewType.TEXTVIEW] {
    return !!view && view.type === ViewType.TEXTVIEW
}

/** 快捷判断：是否为 SelectBoxView */
export function isSelectBoxView(view: IView | null | undefined): view is ViewTypeMap[typeof ViewType.SELECTBOXVIEW] {
    return !!view && view.type === ViewType.SELECTBOXVIEW
}

/** 快捷判断：是否为 CombinedView */
export function isCombinedView(view: IView | null | undefined): view is ViewTypeMap[typeof ViewType.COMBINEDVIEW] {
    return !!view && view.type === ViewType.COMBINEDVIEW
}

/** 快捷判断：是否为 ContainerView（拥有子节点管理能力） */
export function isContainerView(view: IView | null | undefined): view is IContainerView {
    return !!view && (view.type === ViewType.COMBINEDVIEW || view.type === ViewType.FLEXVIEW)
}

/** 快捷判断：是否为 FlexView */
export function isFlexView(view: IView | null | undefined): view is ViewTypeMap[typeof ViewType.FLEXVIEW] {
    return !!view && view.type === ViewType.FLEXVIEW
}

// ────────────────────────────────────────────
//  Addon 类型守卫
// ────────────────────────────────────────────

/** 快捷判断：是否为 BoundingBoxAddon */
export function isBoundingBoxAddon(addon: IViewAddon | null | undefined): addon is IBoundingBoxAddon {
    return !!addon && addon.type === AddonType.BOUNDING_BOX
}

/** 快捷判断：是否为 VertexAddon */
export function isVertexAddon(addon: IViewAddon | null | undefined): addon is IVertexAddon {
    return !!addon && addon.type === AddonType.VERTEX
}

/** 快捷判断：是否为 BoxDecorationAddon */
export function isBoxDecorationAddon(addon: IViewAddon | null | undefined): addon is IBoxDecorationAddon {
    return !!addon && addon.type === AddonType.BOX_DECORATION
}

// ────────────────────────────────────────────
//  流程编辑器 View 守卫（Phase 1.4 将移至 banvas-flow-editor）
// ────────────────────────────────────────────

/** 快捷判断：是否为 PortView */
export function isPortView(view: IView | null | undefined): view is IPortView {
    return !!view && view.type === 'PORTVIEW'
}

/** 快捷判断：是否为 NodeView */
export function isNodeView(view: IView | null | undefined): view is INodeView {
    return !!view && view.type === 'NODEVIEW'
}

/** 快捷判断：是否为 EdgeView */
export function isEdgeView(view: IView | null | undefined): view is IEdgeView {
    return !!view && view.type === 'EDGEVIEW'
}

