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

import { VIEWTYPE } from '@/core/constants'
import type { Matrix4, Point3, Vector3 } from '@/core/math'
import type Bounds from '@/core/graph/base/Bounds'
import type { Line, Rectangle, Circle } from '@/core/graph'
import type { Graph } from '@/core/graph'
import type { BoundingBoxAddonImpl } from '@/core/views/addon'
import type { IGraph, ITextElement, ITextFields, TextIndex } from './IGraph'

// ────────────────────────────────────────────
//  IView —— View 的公共接口
// ────────────────────────────────────────────

/** View 公共契约 —— 所有视图的统一接口 */
export interface IView {
    id: string
    readonly type: VIEWTYPE
    layer: number
    parent: ISceneNode | IView | null
    children: IView[]
    matrix: Matrix4
    content: Graph | null
    viewport: Bounds
    layoutArea: Bounds
    boundingBox: BoundingBoxAddonImpl | null

    // 状态
    selected: boolean
    actived: boolean
    freezed: boolean
    visible: boolean

    // 样式与滚动
    style: IViewStyle
    scrollOffset: { x: number; y: number }
    borderGraph: Rectangle | null
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

    // 数据
    setData(data: Partial<any>): void

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
    setLayer(layer: number): IView

    // 生命周期
    onAttach(): void
    onDestroy(): void
    destroy(): void

    // 辅助
    getSnapObjects(): [Point3[], Line[]]

    // 索引签名
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

/** BoundingBoxAddon 的公共接口 */
export interface IBoundingBoxAddon {
    region: Rectangle
    handles: Rectangle[]
    rotate: [Line, Circle]
    getBounds(): Bounds
    updateSize(): IBoundingBoxAddon
    render(ctx: CanvasRenderingContext2D): void
    copy(): IBoundingBoxAddon
    interact(p: Point3): ExtraData | null
}

/** VertexAddon 的公共接口 */
export interface IVertexAddon {
    vertices: Point3[]
    activeVertex: Point3 | null
    isEditing: boolean
    getVertexCount(): number
    getVertex(index: number): Point3 | null
    setVertex(index: number, vertex: Point3): boolean
    copy(): IVertexAddon
    render(ctx: CanvasRenderingContext2D): void
    interact(p: Point3): ExtraData | null
}

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

/** 视图样式 */
export interface IViewStyle {
    width?: number
    height?: number
    overflow?: 'visible' | 'hidden' | 'scroll'
    scrollX?: number
    scrollY?: number
    transformOrigin?: Point3
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
