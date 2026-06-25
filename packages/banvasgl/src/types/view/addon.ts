/**
 * Addon 接口层 —— 管线插件的公共类型定义
 *
 * 所有管线 addon（BoundingBox / Vertex / BoxDecoration / TextSelection）
 * 的接口定义集中于此文件。AnimationAddon 由于不走管线，其接口定义在 animation.ts 中。
 *
 * 设计原则：
 * - 通过 capabilities 声明参与哪些管线（RENDER / INTERACT / LOGIC）
 * - 通过 priority 决定同管线内执行顺序
 * - IViewAddon 判别联合通过 type 字段收窄具体类型
 */

import type { AddonType, AddonCapability } from '@/foundation/constants'
import type { Point3 } from '@/foundation/math'
import type Bounds from '@/graph/base/Bounds'
import type { Line, Rectangle, Circle } from '@/graph'
import type { TextIndex } from '../graph/graph'
import type { IComputedStyle, IViewStyle } from '../foundation/style'
import type { IDrawingContext } from '../platform/context.js'

// AddonCapability 枚举值定义已迁移至 foundation/constants（打破 barrel 循环依赖），
// 此处仅作为类型引用。

// ────────────────────────────────────────────
//  交互结果类型（addon.interact 返回值依赖）
// ────────────────────────────────────────────

// ExtraData 定义在 interaction.ts 中（叶子文件，不依赖 view/addon/animation），
// 打断 view → animation → addon → view 的循环依赖。
import type { ExtraData } from './interaction'

// ────────────────────────────────────────────
//  IAddonBase —— 所有管线 addon 的基础契约
// ────────────────────────────────────────────

/**
 * Addon 基础接口 —— 所有管线 addon 共有的契约
 *
 * 设计原则：
 * - capabilities 声明职责，管线据此决定调度策略
 * - priority 决定同管线内多个 addon 的执行顺序（数值越小越先执行）
 * - render/interact 方法仅在 capabilities 包含对应职责时被管线调用
 */
export interface IAddonBase {
    readonly type: AddonType
    /** addon 职责声明，管线据此决定是否调用 render/interact */
    capabilities: AddonCapability[]
    /** 管线内执行优先级（数值越小越先执行，默认 0） */
    readonly priority: number
    render(ctx: IDrawingContext): void
    copy(): IAddonBase
    interact(p: Point3, bufferCtx?: IDrawingContext): ExtraData | null
}

// ────────────────────────────────────────────
//  具体 Addon 接口
// ────────────────────────────────────────────

/** TextSelection 公共接口（选区状态） */
export interface ITextSelection {
    fixedIndex: TextIndex | undefined
    dynamicIndex: TextIndex | undefined
    readonly isSelection: boolean
}

/** TextSelectionAddon 的公共接口 */
export interface ITextSelectionAddon extends IAddonBase {
    readonly type: AddonType.TEXT_SELECTION
    readonly selection: ITextSelection
    cursorOpacity: number
    setSelection(fixedIndex: TextIndex | undefined, dynamicIndex: TextIndex | undefined): void
    computeSelectionBoxes(): void
    stopCursorAnimation(): void
    copy(): ITextSelectionAddon
}

/** BoundingBoxAddon 的公共接口 */
export interface IBoundingBoxAddon extends IAddonBase {
    readonly type: AddonType.BOUNDING_BOX
    region: Rectangle
    handles: Rectangle[]
    rotate: [Line, Circle]
    getBounds(): Bounds
    updateSize(): IBoundingBoxAddon
    /** 更新 viewport 引用并重建几何，用于 viewport 对象整体替换场景 */
    updateViewport(viewport: Bounds): IBoundingBoxAddon
    copy(): IBoundingBoxAddon
}

/** VertexAddon 的公共接口 */
export interface IVertexAddon extends IAddonBase {
    readonly type: AddonType.VERTEX
    vertices: Point3[]
    activeVertex: Point3 | null
    isEditing: boolean
    /** 从此索引开始为圆角控制点，-1 表示无 */
    radiusControlStartIndex: number
    /** 边中点索引列表（如 [1,3,5,7]） */
    midpointIndices: number[]
    getVertexCount(): number
    getVertex(index: number): Point3 | null
    setVertex(index: number, vertex: Point3): boolean
    copy(): IVertexAddon
}

/** BoxDecoration 构造选项 —— 纯数据接口（用户传入的原始装饰参数） */
export interface IBoxDecorationOptions {
    backgroundColor?: string
    borderWidth?: number
    borderColor?: string
    borderRadius?: number | [number, number, number, number]
    clipContent?: boolean
    opacity?: number
}

/**
 * BoxDecorationAddon 的公共接口
 *
 * 样式层核心插件：持有 rawStyle（用户原始值）和 computedStyle（计算值），
 * 所有渲染与业务逻辑均读取 computedStyle，原始值仅在 compute() 调用时消费。
 *
 * 职责：
 * 1. 视觉装饰渲染（背景/边框/圆角/裁剪）—— 容器装饰域
 * 2. 滚动条渲染（overflow=scroll 时）—— 布局域派生
 * 3. 维护 computedStyle，包括 scrollOffset 运行时状态和图形绘制域实例
 *
 * 两阶段样式计算：
 * - resolveVisual(rawStyle)：阶段 A，布局前执行。计算与几何无关的视觉属性
 *   （容器装饰域 + 图形绘制域实例化）
 * - resolveLayout(rawStyle, viewport, layoutArea)：阶段 B，布局后执行。
 *   计算依赖几何信息的布局属性（overflow、scrollOffset、滚动条）
 * - compute()：兼容入口，内部依次调用 resolveVisual + resolveLayout
 */
export interface IBoxDecorationAddon extends IAddonBase {
    readonly type: AddonType.BOX_DECORATION
    /** 装饰原始配置（用户传入值，序列化来源） */
    decoration: IBoxDecorationOptions
    /** 计算样式（渲染和逻辑的唯一数据源） */
    readonly computedStyle: IComputedStyle
    /** 渲染背景填充和边框（在 content 之前调用） */
    renderBackground(ctx: IDrawingContext, viewport: Bounds): void
    /** 渲染滚动条（在 renderPlugins 管线中调用） */
    renderScrollBars(ctx: IDrawingContext): void
    /** 构建圆角裁剪路径（computedStyle.clipContent = true 时使用） */
    buildClipPath(ctx: IDrawingContext, viewport: Bounds): void
    /** 装饰层是否有视觉效果（false 时 renderBackground 零开销跳过） */
    hasDecoration(): boolean
    /**
     * 阶段 A：解析与布局无关的视觉样式（容器装饰域 + 图形绘制域）。
     * 仅依赖 rawStyle 声明值，不需要几何信息。
     * 由 View.resolveVisualStyle() 在布局前调用。
     */
    resolveVisual(rawStyle: IViewStyle): void
    /**
     * 阶段 B：解析依赖布局结果的样式（overflow、scrollOffset、滚动条）。
     * 需要布局后的 viewport 和 layoutArea 几何信息。
     * 由 View.resolveLayoutStyle() 在布局后调用。
     */
    resolveLayout(rawStyle: IViewStyle, viewport: Bounds, layoutArea: Bounds): void
    /**
     * 兼容入口：依次调用 resolveVisual + resolveLayout。
     * @deprecated 新代码应直接调用 resolveVisual / resolveLayout
     */
    compute(rawStyle: IViewStyle, viewport: Bounds, layoutArea: Bounds): void
    copy(): IBoxDecorationAddon
    toJSON(): any
}

// ────────────────────────────────────────────
//  Addon 判别联合
// ────────────────────────────────────────────

/** Addon 判别联合 —— 通过 type 字段收窄 */
export type IViewAddon = IBoundingBoxAddon | IVertexAddon | IBoxDecorationAddon | ITextSelectionAddon
