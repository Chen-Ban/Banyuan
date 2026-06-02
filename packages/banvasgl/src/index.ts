/**
 * @banyuan/banvasgl — 核心 2D 图形引擎 · 公共 API
 *
 * 本文件是唯一对外出口，显式列举所有公共符号。
 * 内部实现（CanvasContext、OperationStack、DiffApplier 等）不在此暴露。
 * 包内模块间仍可通过 @/ 别名自由引用。
 */

// ╔══════════════════════════════════════════════════════════════════╗
// ║  types — 接口契约（纯类型，零实现）                               ║
// ╚══════════════════════════════════════════════════════════════════╝

// ── Graph 接口 ──
export type {
    IGraph,
    IAnalyticGraph,
    ILine,
    IArc,
    ICircle,
    IBezier,
    IQuadraticBezier,
    ICubicBezier,
    ICombinedGraph,
    IPolygon,
    ITriangle,
    IQuadrilateral,
    IRectangle,
    IRegularPolygon,
    IRoundedRect,
    IDenseTrajectory,
    IMediaElement,
    IImageElement,
    IVideoElement,
    ITextElement,
    IPrintableTextElement,
    INonPrintableTextElement,
    ITextParagraphContent,
    ITextParagraph,
    ITextFields,
    GraphTypeMap,
    TextIndex,
} from './types'

// ── View 接口 ──
export type {
    FieldType,
    IFieldSchema,
    IFieldSchemaMap,
    // Flow 类型（从内部 flow 模块统一透传）
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
    FlowVarNode,
    FlowPageVarNode,
    FlowEventParamNode,
    FlowNode,
    FlowEdge,
    FlowSchema,
    EventHandler,
    IViewEvents,
    IViewLifetimes,
    IAddonBase,
    IBoundingBoxAddon,
    IVertexAddon,
    IBoxDecorationOptions,
    IBoxDecorationAddon,
    ITextSelectionAddon,
    IComputedStyle,
    IFillStyleOptions,
    IStrokeStyleOptions,
    IShadowStyleOptions,
    IViewAddon,
    ExtraData,
    MoveData,
    ResizeData,
    RotateData,
    EditPointData,
    EditViewportData,
    SelectData,
    TextSelectionData,
    ConnectData,
    NoneData,
    IInteractResult,
    IViewOptions,
    IContainerViewOptions,
    IGraphViewOptions,
    ISelectBoxViewOptions,
    IImageViewOptions,
    IVideoViewOptions,
    ITextViewOptions,
    IViewStyle,
    IFlexLayout,
    IListLayout,
    IGridLayout,
    IScrollLayout,
    LayoutMode,
    TransformOriginKeyword,
    TransformOrigin,
    IView,
    ISceneNode,
    IGraphView,
    ISelectBoxView,
    IImageView,
    IVideoView,
    ITextView,
    IContainerView,
    ICombinedView,
    ITextSelection,
    ViewTypeMap,
    // 流程编辑器视图接口（Phase 1.4 将移至 banvas-flow-editor）
    PortDirection,
    IPortView,
    INodeView,
    IEdgeView,
} from './types'

export { AddonCapability, Cursor, Action } from './types'

// ── Camera 接口 ──
export type {
    ICamera,
    IOrthographicCamera,
    IPerspectiveCamera,
} from './types'

// ── Renderer 接口 ──
export type {
    ICanvasContextOptions,
    ICanvasContext,
    IRendererOptions,
    IRenderer,
} from './types'

// ── Scene 接口 ──
export type {
    ISceneLifetimes,
    IOperationStack,
    IScene,
    SceneAccessor,
    Diff,
    ModifyDiff,
    AddDiff,
    RemoveDiff,
    ReorderDiff,
    PropChange,
    ApplyDirection,
} from './types'

export { DiffType, Operation } from './types'

// ── App 接口 ──
export type {
    IPage,
    IAppOptions,
    IAppLifetimes,
    INavigationOptions,
    IApp,
    IAppStatic,
} from './types'

// ── Animation 接口 ──
export type {
    EasingFunction,
    FillMode,
    PlaybackDirection,
    AnimationState,
    AnimatableValue,
    KeyframeProps,
    KeyframeDefinition,
    AnimationOptions,
    Interpolator,
    IAnimationDescriptor,
    IAnimationAddon,
    Keyframe,
} from './types'

// ── Hook 公共接口 ──
export type {
IViewActions,
IPageActions,
    IAppActions,
    IBanvasActions,
} from './types'

// ── 物料系统接口 ──
export type {
    MaterialSource,
    IMaterialMeta,
    MaterialParameterType,
    IMaterialParameter,
    IMaterialAsset,
    IMaterialTemplate,
    IInternalIdRef,
    IMaterial,
    IMaterialActions,
    IMaterialSerializeConfig,
    IMaterialParameterBinding,
} from './types'

// ── PropertyAdapter 接口 ──
export type {
    PropertyCategory,
    PropertyAdapter,
    PropertyDescriptor,
    ConflictGroup,
} from './types'

// ── 类型守卫 ──
export {
    isGraphType,
    isViewType,
    isView,
    isCombinedGraph,
    isAnalyticGraph,
    isMediaElement,
    isTextView,
    isSelectBoxView,
    isCombinedView,
    isContainerView,
    isBoundingBoxAddon,
    isVertexAddon,
    isBoxDecorationAddon,
    // 流程编辑器（Phase 1.4 将移至 banvas-flow-editor）
    isPortView,
    isNodeView,
    isEdgeView,
} from './types'

// ╔══════════════════════════════════════════════════════════════════╗
// ║  foundation — 零依赖原子模块                                      ║
// ╚══════════════════════════════════════════════════════════════════╝

// ── 常量/枚举 ──
export {
    AppType,
    GraphType,
    ViewType,
    CameraType,
    AddonType,
    VerticalAlign,
    HorizontalAlign,
    FontStyle,
    FontWeight,
} from './foundation'

// ── 数学 ──
export { Point3, Vector3, Matrix4, MathUtils, GeometryUtils } from './foundation'

// ── 样式 ──
export {
    FillStyle,
    StrokeStyle,
    ShadowStyle,
    Gradient,
    LinearGradient,
    RadialGradient,
    ConicGradient,
    Image,
    Video,
    Style,
    Color,
} from './foundation'
export type { GradientStop } from './foundation'

// ── 动画（公共部分） ──
export { Easings } from './foundation'

// ╔══════════════════════════════════════════════════════════════════╗
// ║  graph — 图形体系                                                 ║
// ╚══════════════════════════════════════════════════════════════════╝

export { Graph, Bounds } from './graph'
export {
    AnalyticGraph,
    Arc,
    Circle,
    Bezier,
    QuadraticBezier,
    CubicBezier,
    Line,
} from './graph'
export {
    CombinedGraph,
    Polygon,
    Triangle,
    Quadrilateral,
    Rectangle,
    RegularPolygon,
    RoundedRect,
} from './graph'
export { DenseTrajectory } from './graph'
export {
    TextParagraph,
    TextElement,
    PrintableTextElement,
    NonPrintableTextElement,
    TextFields,
} from './graph'
export type { TextParagraphContent } from './graph'
export { MediaElement, ImageElement, VideoElement } from './graph'

// ╔══════════════════════════════════════════════════════════════════╗
// ║  view — 视图体系                                                  ║
// ╚══════════════════════════════════════════════════════════════════╝

export { View, ContainerView, GraphView, SelectBoxView } from './view'
export { ImageView, VideoView, TextView, CombinedView } from './view'
// 流程编辑器视图（Phase 1.4 将移至 banvas-flow-editor）
export { NodeView, PortView, EdgeView } from './view'
export type { NodeViewOptions, PortDefinition, PortViewOptions, EdgeViewOptions } from './view'

// ╔══════════════════════════════════════════════════════════════════╗
// ║  engine — 引擎运转                                                ║
// ╚══════════════════════════════════════════════════════════════════╝

export { App } from './engine'
export { Scene } from './engine'
export type { SceneOptions } from './engine'

// ── Camera ──
export { BaseCamera, PerspectiveCamera, OrthographicCamera } from './engine'
export type { BaseCameraOptions, PerspectiveCameraOptions, OrthographicCameraOptions } from './engine'

// ── Renderer ──
export { Renderer } from './engine'

// ── Serializer（高级 API：自定义序列化场景） ──
export { Serializer } from './engine'
export type { SerializerOptions, SerializedData } from './engine'

// ── Migrations（高级 API：数据版本迁移） ──
export { MigrationRegistry, migrationRegistry } from './engine'
export type { Migration } from './engine'

// ── Operations（公共部分） ──
export { TransactionManager } from './engine'
export { SnapAlignManager } from './engine'
export type { SnapResult } from './engine'
export { groupViews, ungroupView, flattenViewTree } from './engine'
export type { GroupResult, UngroupResult } from './engine'
export { clearAllStates } from './engine'

// ╔══════════════════════════════════════════════════════════════════╗
// ║  actions — 操作 API                                               ║
// ╚══════════════════════════════════════════════════════════════════╝

export { createBanvasActions } from './actions'
export { getClipboard } from './actions/viewActions.js'

// ╔══════════════════════════════════════════════════════════════════╗
// ║  interaction — 交互状态机                                          ║
// ╚══════════════════════════════════════════════════════════════════╝

export { InteractionStateMachine, resolveActivationTarget } from './engine/interaction'
export type {
InteractionState,
    InteractionInput,
    InteractionOutput,
    InteractionDelegate,
    InteractionStateMachineConfig,
    InteractionCapability,
    HoverTarget,
    PointerDownInput,
    PointerMoveInput,
    PointerUpInput,
    KeyDownInput,
    KeyUpInput,
} from './engine/interaction'

// ╔══════════════════════════════════════════════════════════════════╗
// ║  version                                                          ║
// ╚══════════════════════════════════════════════════════════════════╝

export { version } from './version'
