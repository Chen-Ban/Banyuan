/**
 * @banyuan/banvasgl — 面向声明式 UI 的 2D 图形运行时（含流程控制）· 公共 API
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

// 枚举值 —— 从各自归属模块直接导出（不再通过类型 barrel 透传，防止 chunk 级循环依赖）
export { AddonCapability, Cursor, Action } from './foundation/constants'
export { FLOW_SCHEMA_VERSION } from './types/foundation/flow/index.js'

// ── Flow v2.0.0 类型（从 flow 模块直接导出） ──
export type {
    // control
    FlowControlNode,
    FlowConditionNode,
    FlowLoopNode,
    FlowParallelNode,
    FlowReturnNode,
    // function
    FlowFunctionNode,
    // action
    FlowActionNode,
    FlowSetVariableNode,
    FlowSetViewDataNode,
    FlowSetViewVisibleNode,
    FlowPlayAnimationNode,
    FlowCloudFunctionNode,
    FlowNavigateNode,
    FlowHttpRequestNode,
    FlowDbQueryNode,
    FlowDbInsertNode,
    FlowDbUpdateNode,
    FlowDbDeleteNode,
    FlowLiteralSourceNode,
    FlowContextSourceNode,
    FlowSourceNode,
    FlowMathNode,
    FlowCompareNode,
    FlowLogicNode,
    FlowConcatNode,
    FlowFormatNode,
    FlowGetNode,
    FlowComputeNode,
    FlowNode,
    FlowSchema,
    NodeCategory,
    DataRef,
    // context
    FrontendCapProxy,
    BackendCapProxy,
    CapProxy,
    IFrameStack,
    IFlowRunner,
} from './types/foundation/flow/index.js'
// ── Camera 接口 ──
export type {
    ICamera,
    IOrthographicCamera,
    IPerspectiveCamera,
} from './types'

// ── Renderer 接口 ──
export type {
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

// DiffType / Operation 为运行时值，归属 @/engine/scene，直接导出。
export { DiffType, Operation } from './engine/scene'

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

// ── 平台抽象接口 ──
export type {
    IDrawingGradient,
    IDrawingPattern,
    IDrawingImageSource,
    IDrawingVideoSource,
    IDrawingTextMetrics,
    IDrawingImageData,
    IDrawingVideoLoadOptions,
    DrawingFillRule,
    DrawingLineCap,
    DrawingLineJoin,
    DrawingTextAlign,
    DrawingTextBaseline,
    DrawingImageSmoothingQuality,
    DrawingMatrix2DInit,
    IDrawingContext,
    IDrawingSurface,
} from './types'

// ── PropertyAdapter 接口 ──
export type {
    PropertyCategory,
    PropertyAdapter,
    PropertyDescriptor,
    ConflictGroup,
} from './types'

// ── 类型守卫 ──
// 守卫是“值”（函数），归属 foundation/guards（不再通过类型 barrel 透传）。
export {
    isGraphType,
    isViewType,
    isView,
    isCombinedGraph,
    isAnalyticGraph,
    isMediaElement,
    isTextElement,
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
} from './foundation/guards'

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
// ║  event — 原子事件输入类型契约                                         ║
// ╚══════════════════════════════════════════════════════════════════╝

export type {
  // 指针事件
  PointerInputBase,
  PointerDownInput,
  PointerMoveInput,
  PointerUpInput,
  PointerCancelInput,
  PointerEnterInput,
  PointerLeaveInput,
  PointerInput,
  // 键盘事件
  KeyDownInput,
  KeyUpInput,
  KeyboardInput,
  // 滚轮事件
  WheelInput,
  // 焦点事件
  FocusInput,
  BlurInput,
  // 拖拽事件（引擎内语义）
  DragInputBase,
  DragStartInput,
  DragMoveInput,
  DragEndInput,
  DragInput,
  // IME 组合事件
  CompositionStartInput,
  CompositionUpdateInput,
  CompositionEndInput,
  CompositionInput,
  // 全量联合
  InteractionInput,
} from './types/foundation/event'

// ╔══════════════════════════════════════════════════════════════════╗
// ║  version                                                          ║
// ╚══════════════════════════════════════════════════════════════════╝

export { version } from './version'
