/**
 * View 样式体系 —— 原始声明与计算输出
 *
 * 本文件集中定义 View 层样式管线的两端：
 *
 *   IViewStyle      —— 用户传入的原始样式声明（三域合一）
 *   IComputedStyle  —— BoxDecorationAddon.compute() 的输出契约（已实例化）
 *
 * 独立成文件的原因：
 *   - view.ts 需要 IComputedStyle（BoxDecorationAddon 持有它）
 *   - graph.ts 的 renderWithStyle() 签名也需要 IComputedStyle
 *   - 若定义在 view.ts 内，graph.ts import view.ts 会产生循环依赖
 *   此文件不依赖 view.ts 或 graph.ts，仅依赖 foundation 层。
 */

import type { LinearGradient, RadialGradient, ConicGradient } from '@/foundation/style/gradient/index'
import type Image from '@/foundation/style/Image'
import type FillStyle from '@/foundation/style/FillStyle'
import type StrokeStyle from '@/foundation/style/StrokeStyle'
import type ShadowStyle from '@/foundation/style/ShadowStyle'
import type { Point3 } from '@/foundation/math'

// ────────────────────────────────────────────
//  变换原点
// ────────────────────────────────────────────

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

// ────────────────────────────────────────────
//  图形绘制域辅助类型（对标 FillStyle / StrokeStyle / ShadowStyle 构造参数）
//  设计要点：保持 POJO / JSON-serializable，color 字段统一用 CSS 字符串。
//  BoxDecorationAddon.compute() 负责将这些 options 实例化为对应 class。
// ────────────────────────────────────────────

/**
 * Graph 填充描述（对标 FillStyle 构造参数，POJO 可直接序列化）
 *
 * - fillType 未设置时 BoxDecorationAddon 默认使用 Graph 自身内置默认样式
 * - color 使用 CSS 色值字符串（'#FF0000' / 'rgba(r,g,b,a)'），
 *   compute() 时内部通过 Color.fromCSSString() 解析
 */
export interface IFillStyleOptions {
    fillType?: 'color' | 'linearGradient' | 'radialGradient' | 'conicGradient' | 'image'
    /** 纯色填充色（CSS 色值） */
    color?: string
    linearGradient?: LinearGradient
    radialGradient?: RadialGradient
    conicGradient?: ConicGradient
    image?: Image
}

/**
 * Graph 描边描述（对标 StrokeStyle 构造参数，POJO 可直接序列化）
 */
export interface IStrokeStyleOptions {
    strokeType?: 'color' | 'linearGradient' | 'radialGradient' | 'conicGradient' | 'image'
    /** 纯色描边色（CSS 色值） */
    color?: string
    linearGradient?: LinearGradient
    radialGradient?: RadialGradient
    conicGradient?: ConicGradient
    pattern?: Image
    width?: number
    /** 描边透明度（0-1），默认 1 */
    opacity?: number
    lineCap?: 'butt' | 'round' | 'square'
    lineJoin?: 'miter' | 'round' | 'bevel'
    miterLimit?: number
    dashArray?: number[]
    dashOffset?: number
}

/**
 * Graph 阴影描述（对标 ShadowStyle 构造参数，POJO 可直接序列化）
 */
export interface IShadowStyleOptions {
    /** 阴影色（CSS 色值），默认 '#000000' */
    color?: string
    offsetX?: number
    offsetY?: number
    blur?: number
    /** 阴影透明度（0-1），默认 0.5 */
    opacity?: number
    enabled?: boolean
}

// ────────────────────────────────────────────
//  IViewStyle —— 原始样式声明（用户传入）
// ────────────────────────────────────────────

/** 视图样式 —— 三域合一的完备集合（用户传入的原始值） */
export interface IViewStyle {
    // ── 域一：布局域 ──────────────────────────────────────────────────────
    width?: number
    height?: number
    overflow?: 'visible' | 'hidden' | 'scroll'
    /** overflow=scroll 时的受控滚动位置（px） */
    scrollX?: number
    scrollY?: number
    /** 变换原点，默认为 'center'（视口中心） */
    transformOrigin?: TransformOrigin
    needStructViewport?: boolean

    // ── 域二：容器装饰域（作用于容器盒，由 BoxDecorationAddon 渲染） ────
    /** 容器背景色（CSS 色值），默认 'transparent' */
    backgroundColor?: string
    borderWidth?: number
    borderColor?: string
    borderRadius?: number | [number, number, number, number]
    /** 是否裁剪超出内容，默认 false */
    clipContent?: boolean
    /** 整个 View 的透明度（影响容器+内容），默认 1 */
    opacity?: number

    // ── 域三：图形绘制域（作用于 Graph content，由 Graph.render 消费） ──
    /**
     * Graph 填充样式。
     * 未设置时 Graph 使用自身内置默认样式工厂。
     * fill 永远作用于 Graph，backgroundColor 永远作用于容器盒，两者可同时设置。
     */
    fill?: IFillStyleOptions
    /**
     * Graph 描边样式。
     * 未设置时 Graph 使用自身内置默认样式工厂。
     */
    stroke?: IStrokeStyleOptions
    /**
     * Graph 阴影样式。
     * 未设置时 Graph 使用自身内置默认样式工厂（默认无阴影）。
     */
    shadow?: IShadowStyleOptions
}

// ────────────────────────────────────────────
//  IComputedStyle —— 计算输出（BoxDecorationAddon.compute() 产出）
// ────────────────────────────────────────────

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
