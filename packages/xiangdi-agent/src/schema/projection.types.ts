/**
 * 相地 · AI Projection 类型定义
 *
 * AI Projection 是 BanvasGL 全量 JSON（$type/$value 格式）的等价语义变换。
 * 设计目标：
 *   - 对 LLM 友好：展平嵌套包装、语义化坐标、省略默认值
 *   - 无损双向转换：toAIProjection ↔ fromAIProjection 可完美 roundtrip
 *   - 全类型覆盖：所有 ViewType（含 FlowViews）都有对应投影
 *
 * 与旧 AISchema 的区别：
 *   - AISchema 是有损翻译（丢失 events/lifetimes/decoration/data 等）
 *   - AI Projection 是无损变换（所有信息保留，只是换了表达方式）
 */

/**
 * FlowSchema 在投影中是透传的（不做结构变换），
 * 使用 unknown 避免对 @banyuan/banvasgl/flow 的硬依赖。
 * 实际运行时值为 FlowSchema 对象（nodes + edges 的声明式流程图）。
 */
type FlowSchema = unknown

// ─── 基础类型 ─────────────────────────────────────────────────────────────────

/** 语义化坐标（从 Matrix4 16 元素数组解构） */
export interface AITransform {
    x: number
    y: number
    rotation?: number    // 省略 = 0
    scaleX?: number      // 省略 = 1
    scaleY?: number      // 省略 = 1
}

/** 语义化尺寸（从 Bounds 提取） */
export interface AISize {
    width: number
    height: number
}

/** 2D 点 */
export interface AIPoint2 {
    x: number
    y: number
}

// ─── 样式相关 ─────────────────────────────────────────────────────────────────

/** 颜色值（hex 字符串或渐变对象） */
export type AIColor = string | AIGradient

export interface AIGradient {
    type: 'linear' | 'radial' | 'conic'
    stops: Array<{ offset: number; color: string }>
    /** linear: angle in degrees; radial: center + radius; conic: center + startAngle */
    params?: Record<string, number>
}

/** 填充样式 */
export interface AIFillStyle {
    color?: AIColor
    opacity?: number
}

/** 描边样式 */
export interface AIStrokeStyle {
    color?: AIColor
    width?: number
    style?: 'solid' | 'dashed' | 'dotted'
    opacity?: number
}

/** 阴影样式 */
export interface AIShadowStyle {
    color?: string
    blur?: number
    offsetX?: number
    offsetY?: number
}

/** BoxDecoration 投影 */
export interface AIDecoration {
    fill?: AIFillStyle
    stroke?: AIStrokeStyle
    shadow?: AIShadowStyle
    cornerRadius?: number | [number, number, number, number]
    overflow?: 'visible' | 'hidden' | 'scroll'
}

// ─── 事件与生命周期 ───────────────────────────────────────────────────────────

/** 事件处理器映射（只输出非 null 条目） */
export interface AIEvents {
    onClick?: FlowSchema
    onDoubleClick?: FlowSchema
    onLongPress?: FlowSchema
    onMouseEnter?: FlowSchema
    onMouseLeave?: FlowSchema
    onMouseDown?: FlowSchema
    onMouseUp?: FlowSchema
    onMouseMove?: FlowSchema
    onFocus?: FlowSchema
    onBlur?: FlowSchema
    onChange?: FlowSchema
    onScroll?: FlowSchema
}

/** 生命周期钩子映射（只输出非 null 条目） */
export interface AILifetimes {
    onCreated?: FlowSchema
    onAttach?: FlowSchema
    onDestroy?: FlowSchema
}

// ─── 布局相关 ─────────────────────────────────────────────────────────────────

export type AILayoutMode = 'free' | 'flex' | 'list' | 'grid' | 'scroll'

export interface AIFlexLayout {
    // ── 容器级属性 ──
    direction?: 'row' | 'column'
    wrap?: boolean
    gap?: number
    mainAxisAlignment?: 'start' | 'center' | 'end' | 'space-between' | 'space-around'
    crossAxisAlignment?: 'start' | 'center' | 'end' | 'stretch'
    padding?: number | [number, number, number, number]
    // ── 子元素级属性（当前视图作为 flex 子元素时生效） ──
    flex?: number
    alignSelf?: 'start' | 'center' | 'end' | 'stretch'
}

export interface AIListLayout {
    direction?: 'vertical' | 'horizontal'
    gap?: number
    padding?: number | [number, number, number, number]
}

export interface AIGridLayout {
    columns?: number
    rowGap?: number
    columnGap?: number
    padding?: number | [number, number, number, number]
}


// ─── 数据模型 ─────────────────────────────────────────────────────────────────

/** 字段 Schema（简化表示） */
export interface AIFieldSchema {
    type: string
    defaultValue?: unknown
    label?: string
}

/** 数据模型映射 */
export type AIDataModel = Record<string, AIFieldSchema>

// ─── 投影节点类型 ─────────────────────────────────────────────────────────────

/** 所有投影节点的公共字段 */
export interface AIProjectionNodeBase {
    /** 视图类型标识 */
    type: string
    /** 唯一 ID */
    id: string
    /** 语义化坐标 */
    transform: AITransform
    /** 尺寸 */
    size: AISize

    // ── 以下字段省略时表示默认值 ──

    /** 可见性（省略 = true） */
    visible?: boolean
    /** 冻结状态（省略 = false） */
    freezed?: boolean
    /** 装饰（省略 = 无装饰） */
    decoration?: AIDecoration
    /** 事件处理器（省略 = 无事件） */
    events?: AIEvents
    /** 生命周期钩子（省略 = 无钩子） */
    lifetimes?: AILifetimes
    /** 数据模型（省略 = 无数据） */
    data?: AIDataModel
    /** 子元素级 flex 布局参数（作为 flex 子元素时生效，仅含 flex/alignSelf） */
    flexLayout?: AIFlexLayout
}

// ─── 具体视图类型投影 ─────────────────────────────────────────────────────────

/** GraphView 投影 */
export interface AIGraphViewNode extends AIProjectionNodeBase {
    type: 'GRAPHVIEW'
    /** 图形内容（保留 $type/$value 格式，因为图形类型多样） */
    content: {
        graphType: string
        /** 图形特有数据（展平后的 toJSON 输出） */
        data: Record<string, unknown>
    } | null
}

/** TextView 投影 */
export interface AITextViewNode extends AIProjectionNodeBase {
    type: 'TEXTVIEW'
    /** 文本内容（TextFields 的语义化表示） */
    content: {
        paragraphs: Array<{
            elements: Array<{
                text: string
                style?: {
                    fontSize?: number
                    fontWeight?: string
                    color?: string
                    italic?: boolean
                    underline?: boolean
                }
            }>
            align?: 'left' | 'center' | 'right'
            lineHeight?: number
        }>
    } | null
}

/** ImageView 投影 */
export interface AIImageViewNode extends AIProjectionNodeBase {
    type: 'IMAGEVIEW'
    /** 图片 URL */
    src: string | null
    /** 填充模式 */
    objectFit?: 'fill' | 'contain' | 'cover'
}

/** VideoView 投影 */
export interface AIVideoViewNode extends AIProjectionNodeBase {
    type: 'VIDEOVIEW'
    /** 视频 URL */
    src: string | null
}

/** CombinedView（容器）投影 */
export interface AICombinedViewNode extends AIProjectionNodeBase {
    type: 'COMBINEDVIEW'
    /** 布局模式 */
    layoutMode?: AILayoutMode
    /** Flex 布局完整配置（容器级 + 子元素级属性，继承自 base 扩展） */
    flexLayout?: AIFlexLayout
    /** List 布局配置（layoutMode='list' 时） */
    listLayout?: AIListLayout
    /** Grid 布局配置（layoutMode='grid' 时） */
    gridLayout?: AIGridLayout
    /** 子节点 */
    children: AIProjectionNode[]
}

/** NodeView（流程图节点）投影 */
export interface AINodeViewNode extends AIProjectionNodeBase {
    type: 'NODEVIEW'
    /** 流程节点业务 schema */
    schema: Record<string, unknown>
    /** 节点标题 */
    nodeTitle: string
    /** 子节点（PortView） */
    children: AIProjectionNode[]
}

/** EdgeView（流程图连线）投影 */
export interface AIEdgeViewNode extends AIProjectionNodeBase {
    type: 'EDGEVIEW'
    /** 起始端口 ID */
    fromPortId: string | null
    /** 目标端口 ID */
    toPortId: string | null
}

/** PortView（流程图端口）投影 */
export interface AIPortViewNode extends AIProjectionNodeBase {
    type: 'PORTVIEW'
    /** 端口方向 */
    portDirection: 'input' | 'output' | 'bidirectional'
    /** 最大连线数 */
    maxConnections?: number
}

/** 通用 View 投影（未特化的 ViewType） */
export interface AIGenericViewNode extends AIProjectionNodeBase {
    /** 图形内容（保留原始格式） */
    content?: unknown
    /** 子节点 */
    children?: AIProjectionNode[]
}

/** 所有投影节点的联合类型 */
export type AIProjectionNode =
    | AIGraphViewNode
    | AITextViewNode
    | AIImageViewNode
    | AIVideoViewNode
    | AICombinedViewNode
    | AINodeViewNode
    | AIEdgeViewNode
    | AIPortViewNode
    | AIGenericViewNode

// ─── 页面与应用级投影 ─────────────────────────────────────────────────────────

/** 场景（页面）投影 */
export interface AIProjectionScene {
    id: string
    name?: string
    /** 页面尺寸 */
    size: AISize
    /** 背景色 */
    backgroundColor?: string
    /** 相机类型（省略 = 'ORTHOGRAPHIC'） */
    cameraType?: string
    /** 场景生命周期 */
    lifetimes?: {
        onLoad?: FlowSchema
        onUnload?: FlowSchema
        onShow?: FlowSchema
        onHide?: FlowSchema
    }
    /** 顶层视图列表 */
    children: AIProjectionNode[]
}

// ─── 应用级投影 ─────────────────────────────────────────────────────────────────

/** 应用生命周期钩子映射（App 级别，只输出非 null 条目） */
export interface AIAppLifetimes {
    onLaunch?: FlowSchema
    onUnlaunch?: FlowSchema
}

/** 应用（App）投影 — AI Projection 的顶层结构 */
export interface AIProjectionApp {
    /** BanvasGL 版本号 */
    version: string
    /** 应用生命周期 */
    lifetimes?: AIAppLifetimes
    /** 页面列表 */
    scenes: AIProjectionScene[]
}

// ─── 物料引用 ─────────────────────────────────────────────────────────────────

/** 物料引用节点（AI 可通过 $material 引用已有物料） */
export interface AIMaterialRefNode {
    type: '$material'
    id: string
    materialId: string
    /** 物料参数覆盖 */
    params?: Record<string, unknown>
    /** 放置位置 */
    transform: AITransform
}
