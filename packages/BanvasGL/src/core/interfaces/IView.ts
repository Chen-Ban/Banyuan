/**
 * View 接口层 —— 零循环依赖
 *
 * 所有 View 子类的公共接口定义。
 * 外部消费者通过 interface + 类型守卫访问视图对象。
 *
 * 设计要点：
 *   - 接口中 `type` 保持为宽类型 `VIEWTYPE`，使 class 能直接 implements
 *   - 窄化在 ViewTypeMap 中通过交叉类型实现
 *   - IView / ISceneNode 定义在此文件中，作为唯一来源
 */

import { VIEWTYPE, ADDONTYPE } from '@/core/constants'
import type { Matrix4, Point3, Vector3 } from '@/core/math'
import type Bounds from '@/core/graph/base/Bounds'
import type { Line, Rectangle, Circle } from '@/core/graph'
import type { IGraph, ITextElement, ITextFields, TextIndex } from './IGraph'

// ────────────────────────────────────────────
//  IFieldSchema —— data / properties 的字段定义
// ────────────────────────────────────────────

/** 字段类型 */
export type FieldType = 'string' | 'number' | 'boolean' | 'object'

/**
 * 单个字段的 Schema 定义
 *
 * View.data / View.properties 中每个 key 对应一个 IFieldSchema。
 * - type：字段数据类型，用于面板渲染对应输入控件
 * - default：设计时配置的默认值，运行时初始化时使用
 */
export interface IFieldSchema {
    type: FieldType
    default: any
}

/** 字段定义表 —— View.data 和 View.properties 的实际类型 */
export type IFieldSchemaMap = Record<string, IFieldSchema>

// ────────────────────────────────────────────
//  IViewEvents / IViewLifetimes —— 事件与生命周期
// ────────────────────────────────────────────

/** 事件处理器：设计时为脚本字符串，运行时为函数，未绑定为 null */
export type EventHandler = ((...args: any[]) => void) | string | null

/**
 * View 交互事件表 —— 所有 View 共有的用户交互事件
 *
 * 设计时：值为 string（用户编写的脚本代码）或 null（未绑定）
 * 运行时：值为实际函数或 null
 * hook 层根据 mode 决定是否触发
 */
export interface IViewEvents {
    onClick: EventHandler
    onDoubleClick: EventHandler
    onMouseEnter: EventHandler
    onMouseLeave: EventHandler
    onMouseDown: EventHandler
    onMouseUp: EventHandler
}

/**
 * View 生命周期钩子 —— 用户自定义的生命周期回调
 *
 * 与引擎内部的生命周期方法（onAttach/onDestroy）分离：
 * - 引擎内部方法：由 Scene/CombinedView 等在合适时机调用，处理引擎逻辑
 * - lifetimes：用户在设计时绑定的自定义逻辑，由引擎内部方法在执行时附带调用
 */
export interface IViewLifetimes {
    onCreated: EventHandler
    onAttach: EventHandler
    onDestroy: EventHandler
}

// ────────────────────────────────────────────
//  IView —— View 的公共接口
// ────────────────────────────────────────────

/** View 公共契约 —— 所有视图的统一接口 */
export interface IView {
    id: string
    readonly type: VIEWTYPE
    parent: ISceneNode | IView | null
    children: IView[]
    matrix: Matrix4
    content: IGraph | null
    viewport: Bounds
    layoutArea: Bounds
    boundingBox: IBoundingBoxAddon | null

    // 状态
    selected: boolean
    actived: boolean
    freezed: boolean
    visible: boolean

    // 样式与滚动
    style: IViewStyle
    scrollOffset: { x: number; y: number }
    scrollBarHorization: Rectangle | null
    scrollBarVertical: Rectangle | null

    // 布局与渲染
    layoutContent(): Bounds
    measureChildren(): Bounds
    renderContent(ctx: CanvasRenderingContext2D): void
    layout(): void
    render(): void
    copy(): IView

    // 交互
    interact(worldPoint: Point3): IInteractResult

    // 数据与属性
    data: IFieldSchemaMap
    properties: IFieldSchemaMap
    setData(data: Partial<IFieldSchemaMap>): void

    // 事件与生命周期
    events: IViewEvents
    lifetimes: IViewLifetimes

    // 变换
    resize(
        fixedPoint: Point3,
        dynamicPoint: Point3,
        vector: Vector3,
        needResizeContent?: boolean
    ): void
    getWorldMatrix(parent?: IView): Matrix4
    getMVPMatrix(): Matrix4
    setVPMatrix(vpMatrix: Matrix4): void
    translate(x: number, y: number, z?: number): IView
    scale(x: number, y: number, z?: number, origin?: Point3): IView
    rotate(x: number, y: number, z: number, origin?: Point3): IView

    // 状态切换
    setActived(actived: boolean): IView
    setSelected(selected: boolean): IView
    setVisible(visible: boolean): IView
    setFreezed(freezed: boolean): IView

    // 生命周期
    onAttach(): void
    onDestroy(): void
    destroy(): void

    // 辅助
    getSnapObjects(): [Point3[], Line[]]

    // 索引签名（子类可能有额外属性，如 verticalAlign、fixedWidth 等）
    [key: string]: any
}

// ────────────────────────────────────────────
//  ISceneNode —— Scene 作为"容器节点"的接口
// ────────────────────────────────────────────
export interface ISceneNode {
    id: string
    children: IView[]
    data: any
}

// ────────────────────────────────────────────
//  Addon 接口（从 addon 模块提升到此处避免循环）
// ────────────────────────────────────────────

/** Addon 基础接口 —— 所有 addon 共有的契约 */
export interface IAddonBase {
    readonly type: ADDONTYPE
    render(ctx: CanvasRenderingContext2D): void
    copy(): IAddonBase
    interact(p: Point3): ExtraData | null
}

/** BoundingBoxAddon 的公共接口 */
export interface IBoundingBoxAddon extends IAddonBase {
    readonly type: ADDONTYPE.BOUNDING_BOX
    region: Rectangle
    handles: Rectangle[]
    rotate: [Line, Circle]
    getBounds(): Bounds
    updateSize(): IBoundingBoxAddon
    copy(): IBoundingBoxAddon
}

/** VertexAddon 的公共接口 */
export interface IVertexAddon extends IAddonBase {
    readonly type: ADDONTYPE.VERTEX
    vertices: Point3[]
    activeVertex: Point3 | null
    isEditing: boolean
    getVertexCount(): number
    getVertex(index: number): Point3 | null
    setVertex(index: number, vertex: Point3): boolean
    copy(): IVertexAddon
}

/** Addon 判别联合 —— 通过 type 字段收窄 */
export type IViewAddon = IBoundingBoxAddon | IVertexAddon

// ────────────────────────────────────────────
//  交互类型
// ────────────────────────────────────────────

export enum Cursor {
    // 基本值
    Auto = 'auto',
    Default = 'default',
    None = 'none',

    // 链接和状态指示
    ContextMenu = 'context-menu',
    Help = 'help',
    Pointer = 'pointer',
    Progress = 'progress',
    Wait = 'wait',

    // 选择
    Cell = 'cell',
    Crosshair = 'crosshair',
    Text = 'text',
    VerticalText = 'vertical-text',

    // 拖拽
    Alias = 'alias',
    Copy = 'copy',
    Move = 'move',
    NoDrop = 'no-drop',
    NotAllowed = 'not-allowed',
    Grab = 'grab',
    Grabbing = 'grabbing',

    // 滚动
    AllScroll = 'all-scroll',

    // 调整大小
    ColResize = 'col-resize',
    RowResize = 'row-resize',
    NResize = 'n-resize',
    EResize = 'e-resize',
    SResize = 's-resize',
    WResize = 'w-resize',
    NeResize = 'ne-resize',
    NwResize = 'nw-resize',
    SeResize = 'se-resize',
    SwResize = 'sw-resize',
    EwResize = 'ew-resize',
    NsResize = 'ns-resize',
    NeswResize = 'nesw-resize',
    NwseResize = 'nwse-resize',

    // 缩放
    ZoomIn = 'zoom-in',
    ZoomOut = 'zoom-out',
}

/** BoundingBox 8 个缩放手柄索引 → 光标样式映射 */
export const cursorMap: Record<number, Cursor> = {
    0: Cursor.NwResize, // 西北
    1: Cursor.NResize, // 北
    2: Cursor.NeResize, // 东北
    3: Cursor.EResize, // 东
    4: Cursor.SeResize, // 东南
    5: Cursor.SResize, // 南
    6: Cursor.SwResize, // 西南
    7: Cursor.WResize, // 西
}

export enum Action {
    MOVE,
    RESIZE,
    ROTATE,
    EDIT_POINT,
    EDIT_VIEWPORT,
    SELECT,
    TEXT_SELECTION,
    NONE,
}

// ── ExtraData 判别联合 ──

interface ExtraDataBase {
    cursorStyle: Cursor
}

export interface MoveData extends ExtraDataBase {
    action: Action.MOVE
}

export interface ResizeData extends ExtraDataBase {
    action: Action.RESIZE
    resizeFixedIndex: number
    resizeDynamicIndex: number
}

export interface RotateData extends ExtraDataBase {
    action: Action.ROTATE
}

export interface EditPointData extends ExtraDataBase {
    action: Action.EDIT_POINT
    editPoint: Point3
}

export interface EditViewportData extends ExtraDataBase {
    action: Action.EDIT_VIEWPORT
    viewPortPoint: Point3
}

export interface SelectData extends ExtraDataBase {
    action: Action.SELECT
}

export interface TextSelectionData extends ExtraDataBase {
    action: Action.TEXT_SELECTION
}

export interface NoneData extends ExtraDataBase {
    action: Action.NONE
}

/** 交互结果数据 —— 判别联合，通过 action 字段收窄类型 */
export type ExtraData =
    | MoveData
    | ResizeData
    | RotateData
    | EditPointData
    | EditViewportData
    | SelectData
    | TextSelectionData
    | NoneData

/** View 交互结果 */
export interface IInteractResult {
    view: IView | null
    content: IGraph | IViewAddon | null
    extraData: ExtraData | null
}

/**
 * 变换原点关键字
 *
 * 相对于 viewport 的预设位置：
 * - 'center': 视口中心（默认值）
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

/** 视图样式 */
export interface IViewStyle {
    width?: number
    height?: number
    overflow?: 'visible' | 'hidden' | 'scroll'
    scrollX?: number
    scrollY?: number
    /** 变换原点，默认为 'center'（视口中心） */
    transformOrigin?: TransformOrigin
    needStructViewport?: boolean
}

// ────────────────────────────────────────────
//  具体 View 接口
// ────────────────────────────────────────────

/** GraphView 接口 */
export interface IGraphView extends IView {
    content: IGraph
    controlPoints: IVertexAddon | null
}

/** SelectBoxView 接口 */
export interface ISelectBoxView extends IView {
    content: IGraph
    updateSelect(anchorPoint: Point3, dynamicPoint: Point3): void
}

/** ImageView 接口 */
export interface IImageView extends IView {}

/** VideoView 接口 */
export interface IVideoView extends IView {}

/** Selection 公共接口 */
export interface ISelection {
    fixedIndex: TextIndex | undefined
    dynamicIndex: TextIndex | undefined
    readonly isSelection: boolean
}

/** TextView 接口 */
export interface ITextView extends IView {
    content: ITextFields
    editable: boolean
    selection: ISelection

    // 文本编辑能力
    getContentText(): string[]
    constraintPoint(relativePoint: Point3): Point3
    element2Index(textElement: ITextElement, p: Point3): TextIndex
    setSelection(
        fixedIndex: TextIndex | undefined,
        dynamicIndex: TextIndex | undefined
    ): void
    input(content: string, isComposition: boolean): void
    delete(isBackspace: boolean): void
    newLine(): void
}

/** CombinedView 接口 */
export interface ICombinedView extends IView {
    addChild(child: IView): void
    removeChild(child: IView): void
    clear(): void
}

/** Input 接口（继承 TextView） */
export interface IInput extends ITextView {}

// ────────────────────────────────────────────
//  ViewTypeMap —— 枚举值 → 接口 + 窄 type 的映射
// ────────────────────────────────────────────

export interface ViewTypeMap {
    [VIEWTYPE.VIEW]: IView
    [VIEWTYPE.GRAPHVIEW]: IGraphView & { readonly type: VIEWTYPE.GRAPHVIEW }
    [VIEWTYPE.SELECTBOXVIEW]: ISelectBoxView & {
        readonly type: VIEWTYPE.SELECTBOXVIEW
    }
    [VIEWTYPE.IMAGEVIEW]: IImageView & { readonly type: VIEWTYPE.IMAGEVIEW }
    [VIEWTYPE.VIDEOVIEW]: IVideoView & { readonly type: VIEWTYPE.VIDEOVIEW }
    [VIEWTYPE.TEXTVIEW]: ITextView & { readonly type: VIEWTYPE.TEXTVIEW }
    [VIEWTYPE.COMBINEDVIEW]: ICombinedView & {
        readonly type: VIEWTYPE.COMBINEDVIEW
    }
    [VIEWTYPE.INPUT]: IInput & { readonly type: VIEWTYPE.INPUT }
    [VIEWTYPE.EDITABLETEXT]: ITextView & {
        readonly type: VIEWTYPE.EDITABLETEXT
    }
}
