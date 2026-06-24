/**
 * 图形绘制域辅助类型（对标 FillStyle / StrokeStyle / ShadowStyle 构造参数）
 *
 * 设计要点：保持 POJO / JSON-serializable，color 字段统一用 CSS 字符串。
 * BoxDecorationAddon.compute() 负责将这些 options 实例化为对应 class。
 */

import type { LinearGradient, RadialGradient, ConicGradient } from '@/foundation/style/gradient/index'
import type Image from '@/foundation/style/Image'

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
