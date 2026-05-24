/**
 * View 接口层 —— 零循环依赖
 *
 * 所有 View 子类的公共接口定义。
 * 外部消费者通过 interface + 类型守卫访问视图对象。
 *
 * 设计要点：
 *   - 接口中 `type` 保持为宽类型 `ViewType`，使 class 能直接 implements
 *   - 窄化在 ViewTypeMap 中通过交叉类型实现
 *   - IView / ISceneNode 定义在此文件中，作为唯一来源
 */

import { ViewType, AddonType } from '@/foundation/constants'
import type { Matrix4, Point3, Vector3 } from '@/foundation/math'
import type Bounds from '@/graph/base/Bounds'
import type { Line, Rectangle, Circle } from '@/graph'
import type { IGraph, ITextElement, ITextFields, TextIndex } from './graph'
import type { LinearGradient, RadialGradient, ConicGradient } from '@/foundation/style/gradient/index'
import type Image from '@/foundation/style/Image'
// IViewStyle、IComputedStyle 及辅助类型（IFillStyleOptions 等）已迁移到 ./style.ts。
// 此处 import 供文件内部使用，同时 re-export 维持 types/index.ts 导出链。
import type { IComputedStyle, IViewStyle } from './style'
export type { IComputedStyle, IViewStyle, IFillStyleOptions, IStrokeStyleOptions, IShadowStyleOptions, TransformOriginKeyword, TransformOrigin } from './style'

// ────────────────────────────────────────────
//  IFieldSchema —— data 的字段定义
// ────────────────────────────────────────────

/** 字段类型 */
export type FieldType = 'string' | 'number' | 'boolean' | 'object'

/**
 * 单个字段的 Schema 定义
 *
 * View.data 中每个 key 对应一个 IFieldSchema。
 * - type：    字段数据类型，用于面板渲染对应输入控件
 * - default： 字段的默认值，设计时配置，运行时不可修改
 * - value：   运行时实际值；未设置时读取方应回退到 default
 *
 * 读取约定：`field.value ?? field.default`
 * 写入约定：FlowRunner 的 setData 节点只写 value，default 永远不变
 */
export interface IFieldSchema {
    type:     FieldType
    default:  string | number | boolean | object
    value?:   string | number | boolean | object
}

/** 字段定义表 —— View.data 的实际类型 */
export type IFieldSchemaMap = Record<string, IFieldSchema>

// ────────────────────────────────────────────
//  Flow 类型 —— 从 @banyuan/flow 统一重导出
// ────────────────────────────────────────────

export type {
    FlowValue,
    FlowCondition,
    FlowLiteralValue,
    FlowDataRefValue,
    FlowPageDataRefValue,
    FlowEventArgValue,
    FlowNodeRefValue,
    FlowConditionNode,
    FlowDelayNode,
    FlowSetVariableNode,
    FlowCallFlowNode,
    FlowSetDataNode,
    FlowNavigateNode,
    FlowAnimateNode,
    FlowSetVisibleNode,
    FlowNode,
    FlowVarNode,
    FlowPageVarNode,
    FlowEventParamNode,
    FlowEdge,
    FlowSchema,
} from '@banyuan/flow'

// 文件内使用（EventHandler 等需要引用 FlowSchema）
import type { FlowSchema } from '@banyuan/flow'

// ────────────────────────────────────────────
//  IViewEvents / IViewLifetimes —— 事件与生命周期
// ────────────────────────────────────────────

/**
 * 事件处理器 —— 可视化编排的结构化描述，或未绑定（null）
 *
 * 用户通过可视化面板编排动作流，引擎在运行时将 FlowSchema 编译执行。
 * 不支持手写脚本字符串，所有逻辑均通过 FlowSchema 节点表达。
 */
export type EventHandler = FlowSchema | null

/**
 * View 交互事件表 —— 覆盖桌面端常用交互
 *
 * 所有事件仅在运行模式下触发，编辑模式下引擎拦截，不执行用户逻辑。
 *
 * ── 点击类 ──
 * onClick        用户完成一次点击（mousedown + mouseup 在同一元素上抬起）
 * onDoubleClick  用户在短时间内连续点击两次
 * onContextMenu  用户右键点击（或长按触发上下文菜单）
 *
 * ── 鼠标移动类 ──
 * onMouseEnter   鼠标指针首次进入 View 命中区域（不冒泡）
 * onMouseLeave   鼠标指针离开 View 命中区域（不冒泡）
 * onMouseMove    鼠标指针在 View 命中区域内移动（高频触发，慎用复杂逻辑）
 * onMouseDown    鼠标按键在 View 上按下
 * onMouseUp      鼠标按键在 View 上抬起
 *
 * ── 拖拽类 ──
 * onDragStart    用户开始拖拽（mousedown 后移动距离超过阈值时触发）
 * onDrag         拖拽进行中（高频触发，慎用复杂逻辑）
 * onDragEnd      拖拽结束（mouseup 时触发）
 *
 * ── 焦点类（仅对可聚焦 View 如 Input 有效） ──
 * onFocus        View 获得焦点
 * onBlur         View 失去焦点
 */
export interface IViewEvents {
    // 点击类
    onClick:       EventHandler
    onDoubleClick: EventHandler
    onContextMenu: EventHandler
    // 鼠标移动类
    onMouseEnter:  EventHandler
    onMouseLeave:  EventHandler
    onMouseMove:   EventHandler
    onMouseDown:   EventHandler
    onMouseUp:     EventHandler
    // 拖拽类
    onDragStart:   EventHandler
    onDrag:        EventHandler
    onDragEnd:     EventHandler
    // 焦点类
    onFocus:       EventHandler
    onBlur:        EventHandler
}

/**
 * View 用户生命周期钩子 —— 用户在设计时绑定的自定义逻辑
 *
 * 与引擎内部生命周期方法（View.onAttach / View.onDestroy）的区别：
 * - 引擎内部方法：由 Scene/CombinedView 在合适时机调用，处理引擎自身逻辑
 *   （注册到渲染树、释放资源等），业务层不可覆盖
 * - lifetimes：在引擎内部方法执行完毕后附带调用，供用户绑定业务逻辑
 *
 * 触发顺序（以一个 View 被添加到页面为例）：
 *   1. new View()           → onCreated 触发
 *   2. scene.addChild(view) → 引擎内部 onAttach 执行完毕 → onAttach 触发
 *   3. scene.removeChild()  → 引擎内部 onDestroy 执行完毕 → onDestroy 触发
 *
 * ── 各钩子说明 ──
 *
 * onCreated
 *   触发时机：View 首次挂载到 Scene 时触发（仅触发一次，在 onAttach 之前）
 *   典型用途：初始化 View 自身的 data 字段默认值
 *   注意：首次 onAttach 时按顺序执行 onCreated → onAttach，之后仅触发 onAttach
 *
 * onAttach
 *   触发时机：View 被添加到 Scene 或 CombinedView 的子树后触发
 *   典型用途：读取页面数据、订阅其他 View 的状态、启动定时动画
 *   注意：此时可通过 page.data 访问页面数据，可通过 view(id) 访问同页面其他 View
 *
 * onDestroy
 *   触发时机：View 从场景中移除并销毁前触发
 *   典型用途：清理定时器、取消订阅、释放用户侧资源
 *   注意：触发后 View 实例即将失效，不应再持有其引用
 */
export interface IViewLifetimes {
    onCreated: EventHandler
    onAttach:  EventHandler
    onDestroy: EventHandler
}

// ────────────────────────────────────────────
//  IView —— View 的公共接口
// ────────────────────────────────────────────

/** View 公共契约 —— 所有视图的统一接口 */
export interface IView {
    id: string
    readonly type: ViewType
    parent: ISceneNode | IView | null
    readonly children: IView[]
    matrix: Matrix4
    content: IGraph | null
    viewport: Bounds
    layoutArea: Bounds
    boundingBox: IBoundingBoxAddon | null
    /** 视觉装饰插件（背景、边框、圆角、裁剪），按需挂载 */
    decoration: IBoxDecorationAddon | null
    /** 布局参数（作为子元素参与父容器的布局时使用） */
    layoutParams?: IFlexLayoutParams

    // 状态
    selected: boolean
    actived: boolean
    freezed: boolean
    visible: boolean

    // 样式
    style: IViewStyle

    // 布局与渲染
    layoutContent(ctx?: CanvasRenderingContext2D): Bounds
    measureChildren(): Bounds
    renderContent(ctx: CanvasRenderingContext2D): void
    layout(ctx?: CanvasRenderingContext2D): Bounds
    render(): void
    copy(): IView

    // 交互
    interact(worldPoint: Point3): IInteractResult

    // 数据
    data: IFieldSchemaMap
    /**
     * 设置运行时字段值
     *
     * 只写入各字段的 value，不修改 default 和 type。
     * key 不存在于 data 中时静默忽略。
     *
     * @param values  { [fieldKey]: 新值 }
     */
    setData(values: Record<string, string | number | boolean | object>): void

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

/**
 * Addon 基础接口 —— 所有 addon 共有的契约
 *
 * 设计原则：
 * - capabilities 声明职责，管线据此决定调度策略
 * - priority 决定同管线内多个 addon 的执行顺序（数值越小越先执行）
 * - render/interact 方法仅在 capabilities 包含对应职责时被管线调用
 */
export interface IAddonBase {
    readonly type: AddonType
    /** addon 职责声明，管线据此决定是否调用 render/interact */
    readonly capabilities: readonly AddonCapability[]
    /** 管线内执行优先级（数值越小越先执行，默认 0） */
    readonly priority: number
    render(ctx: CanvasRenderingContext2D): void
    copy(): IAddonBase
    interact(p: Point3, bufferCtx?: CanvasRenderingContext2D): ExtraData | null
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

/** Addon 判别联合 —— 通过 type 字段收窄 */
export type IViewAddon = IBoundingBoxAddon | IVertexAddon | IBoxDecorationAddon | ITextSelectionAddon

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
    CONNECT,   // 端口连线
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

export interface ConnectData extends ExtraDataBase {
    action: Action.CONNECT
    /** 触发连线的源端口 View id */
    portViewId: string
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
    | ConnectData
    | NoneData

/** View 交互结果 */
export interface IInteractResult {
    view: IView | null
    content: IGraph | IViewAddon | null
    extraData: ExtraData | null
}

/** View 构造选项 —— 纯数据接口，不依赖具体 View 类 */
export interface IViewOptions<D extends IFieldSchemaMap = any> {
    id?: string
    name?: string
    content?: IGraph
    children?: IView[]
    parent?: ISceneNode | IView
    data?: D
    style?: IViewStyle
    matrix?: Matrix4
    lifetimes?: Partial<IViewLifetimes>
    events?: Partial<IViewEvents>
    decoration?: IBoxDecorationOptions
    layoutParams?: IFlexLayoutParams
}

/** ContainerView 构造选项 */
export interface IContainerViewOptions<D extends IFieldSchemaMap = any> extends IViewOptions<D> {
    children?: IView[]
}

/** GraphView 构造选项（content 由构造函数单独传入） */
export interface IGraphViewOptions extends Omit<IViewOptions, 'content'> {}

/** SelectBoxView 构造选项 */
export interface ISelectBoxViewOptions extends IGraphViewOptions {}

/** ImageView 构造选项（content 由构造函数单独传入） */
export interface IImageViewOptions extends Omit<IViewOptions, 'content'> {}

/** VideoView 构造选项（content 由构造函数单独传入） */
export interface IVideoViewOptions extends Omit<IViewOptions, 'content'> {}

/** TextView 构造选项（content 由构造函数单独传入） */
export interface ITextViewOptions extends Omit<IViewOptions, 'content'> {
    editable?: boolean
    verticalAlign?: string
}

/** Input 构造选项 */
export interface IInputOptions extends ITextViewOptions {}

/** FlexView 构造选项 */
export interface IFlexViewOptions extends IContainerViewOptions {
    flexStyle?: Partial<IFlexStyle>
}

// TransformOriginKeyword、TransformOrigin、IFillStyleOptions、IStrokeStyleOptions、
// IShadowStyleOptions、IViewStyle、IComputedStyle 已迁移到 ./style.ts，
// 顶部已 re-export，外部消费者行为不变。

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

/** TextSelection 公共接口 */
export interface ITextSelection {
    fixedIndex: TextIndex | undefined
    dynamicIndex: TextIndex | undefined
    readonly isSelection: boolean
}

/** TextView 接口 */
export interface ITextView extends IView {
    content: ITextFields
    editable: boolean
    selection: ITextSelection

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

/**
 * ContainerView 接口 —— 拥有子节点管理能力的容器视图
 *
 * 只有容器类型的 View（CombinedView、NodeView）实现此接口。
 * 叶子视图（GraphView、TextView 等）不实现此接口，其 children 始终为空数组。
 */
export interface IContainerView extends IView {
    readonly children: IView[]
    addChild(child: IView): void
    removeChild(child: IView): void
    clear(): void
}

/** CombinedView 接口 */
export interface ICombinedView extends IContainerView {}

// ────────────────────────────────────────────
//  FlexView 布局相关接口
// ────────────────────────────────────────────

/** 子元素参与 Flex 布局的参数（挂载在 View.layoutParams 上） */
export interface IFlexLayoutParams {
    /** flex 权重（0 或缺省 = 固定尺寸，> 0 = 弹性分配剩余空间） */
    flex?: number
    /** 覆盖容器的 crossAxisAlignment */
    alignSelf?: 'start' | 'center' | 'end' | 'stretch'
}

/** FlexView 布局配置 */
export interface IFlexStyle {
    /** 主轴方向 */
    direction: 'row' | 'column'
    /** 子元素间距 */
    gap: number
    /** 主轴对齐方式 */
    mainAxisAlignment: 'start' | 'center' | 'end' | 'spaceBetween' | 'spaceAround'
    /** 交叉轴对齐方式 */
    crossAxisAlignment: 'start' | 'center' | 'end' | 'stretch'
    /** 内边距（布局区域缩进） */
    padding: number | [number, number, number, number]
}

/** FlexView 接口 */
export interface IFlexView extends IContainerView {
    flexStyle: IFlexStyle
}

/** Input 接口（继承 TextView） */
export interface IInput extends ITextView {}

// ────────────────────────────────────────────
//  流程编辑器 View 接口（Phase 1.4 将移至 banvas-flow-editor）
// ────────────────────────────────────────────

/** 端口方向 */
export type PortDirection = 'input' | 'output' | 'bidirectional'

/** PortView 接口 */
export interface IPortView extends IView {
    portDirection: PortDirection
    /** 获取端口世界坐标中心点 */
    getWorldCenter(): Point3
}

/** NodeView 接口 */
export interface INodeView extends IContainerView {
    /** 节点标题 */
    nodeTitle: string
}

/** EdgeView 接口 */
export interface IEdgeView extends IView {
    fromPortId: string | null
    toPortId: string | null
    /** 连线拖拽中：更新临时终点坐标 */
    setTempTarget(point: Point3): void
    /** 完成连线，绑定源端口和目标端口 */
    connect(fromPortId: string, toPortId: string): void
}

// ────────────────────────────────────────────
//  ViewTypeMap —— 枚举值 → 接口 + 窄 type 的映射
// ────────────────────────────────────────────

export interface ViewTypeMap {
    [ViewType.VIEW]: IView
    [ViewType.GRAPHVIEW]: IGraphView & { readonly type: typeof ViewType.GRAPHVIEW }
    [ViewType.SELECTBOXVIEW]: ISelectBoxView & {
        readonly type: typeof ViewType.SELECTBOXVIEW
    }
    [ViewType.IMAGEVIEW]: IImageView & { readonly type: typeof ViewType.IMAGEVIEW }
    [ViewType.VIDEOVIEW]: IVideoView & { readonly type: typeof ViewType.VIDEOVIEW }
    [ViewType.TEXTVIEW]: ITextView & { readonly type: typeof ViewType.TEXTVIEW }
    [ViewType.COMBINEDVIEW]: ICombinedView & {
        readonly type: typeof ViewType.COMBINEDVIEW
    }
    [ViewType.INPUT]: IInput & { readonly type: typeof ViewType.INPUT }
    [ViewType.EDITABLETEXT]: ITextView & {
        readonly type: typeof ViewType.EDITABLETEXT
    }
    [ViewType.FLEXVIEW]: IFlexView & {
        readonly type: typeof ViewType.FLEXVIEW
    }
}
