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

import { AddonType } from '@/foundation/constants'
import type { Point3 } from '@/foundation/math'
import type Bounds from '@/graph/base/Bounds'
import type { Line, Rectangle, Circle } from '@/graph'
import type { ITextFields, TextIndex } from '../graph/graph'
import type { IComputedStyle, IViewStyle } from '../foundation/style'

// ────────────────────────────────────────────
//  AddonCapability 枚举
// ────────────────────────────────────────────

/**
 * Addon 职责标识
 *
 * 每个 addon 通过 capabilities 声明自己参与哪些管线：
 * - RENDER：参与渲染管线（renderPlugins 阶段调用 render()）
 * - INTERACT：参与交互管线（interactPlugins 阶段调用 interact()）
 * - LOGIC：参与逻辑计算（如 BoundingBox 在多选 resize 时提供几何数据，
 *   但不渲染也不交互）
 *
 * 一个 addon 可以同时声明多个职责，管线根据 capabilities 决定是否调用对应方法。
 * 这避免了管线空跑（调用 render/interact 后 early return）的性能浪费，
 * 也让 addon 的设计意图在代码层面自文档化。
 */
export enum AddonCapability {
    /** 参与渲染管线 —— renderPlugins 阶段调用 render() */
    RENDER = 'RENDER',
    /** 参与交互管线 —— interactPlugins 阶段调用 interact() */
    INTERACT = 'INTERACT',
    /** 参与逻辑计算 —— 不渲染不交互，仅提供数据/计算能力 */
    LOGIC = 'LOGIC',
}

// ────────────────────────────────────────────
//  交互结果类型（addon.interact 返回值依赖）
// ────────────────────────────────────────────

// ExtraData 定义在 view.ts 中（依赖 Action 枚举和 Cursor），
// addon 接口只引用其类型，通过 import type 延迟绑定。
import type { ExtraData } from './view'

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
    render(ctx: CanvasRenderingContext2D): void
    copy(): IAddonBase
    interact(p: Point3, bufferCtx?: CanvasRenderingContext2D): ExtraData | null
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
 * 4. 提供 compute() 方法，在每次 layout 末尾将 rawStyle → computedStyle
 *
 * compute() 的三域处理：
 * - 布局域：解析 overflow，计算 scrollOffset（clamp）
 * - 容器装饰域：直通 decoration 字段（归一化 borderRadius）
 * - 图形绘制域：将 IFillStyleOptions / IStrokeStyleOptions / IShadowStyleOptions
 *   实例化为 FillStyle / StrokeStyle / ShadowStyle；未设置时写入 null，
 *   Graph.render() 看到 null 则使用自身内置默认样式。
 */
export interface IBoxDecorationAddon {
    readonly type: AddonType.BOX_DECORATION
    readonly capabilities: readonly AddonCapability[]
    readonly priority: number
    /** 装饰原始配置（用户传入值，序列化来源） */
    decoration: IBoxDecorationOptions
    /** 计算样式（渲染和逻辑的唯一数据源） */
    readonly computedStyle: IComputedStyle
    /** 渲染背景填充和边框（在 content 之前调用） */
    renderBackground(ctx: CanvasRenderingContext2D, viewport: Bounds): void
    /** 渲染滚动条（在 renderPlugins 管线中调用） */
    renderScrollBars(ctx: CanvasRenderingContext2D): void
    /** 构建圆角裁剪路径（computedStyle.clipContent = true 时使用） */
    buildClipPath(ctx: CanvasRenderingContext2D, viewport: Bounds): void
    /** 装饰层是否有视觉效果（false 时 renderBackground 零开销跳过） */
    hasDecoration(): boolean
    /**
     * 将 rawStyle 计算为 computedStyle，同时更新 scrollOffset 和图形绘制域实例。
     * 在每次 layout() 末尾由 View 调用。
     *
     * @param rawStyle   用户原始样式（IViewStyle，三域合一）
     * @param viewport   View 当前视口
     * @param layoutArea View 当前布局区域
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
