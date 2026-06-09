/**
 * 接口层 barrel 导出
 *
 * 所有图形和视图的接口、类型映射、统一类型守卫从这里统一导出。
 * 消费方只需：
 *   import { ILine, isGraphType, GraphType } from '@/types'
 *
 * 目录结构：
 *   types/
 *   ├── engine/    — App、Scene、Camera、Renderer、Animation
 *   ├── foundation/ — Style、Serializable、Transferable
 *   ├── graph/     — Graph 基元接口
 *   ├── view/      — View、Addon、Hook、Property
 *   ├── guards.ts  — 跨层类型守卫
 *   └── index.ts   — 本文件（总 barrel）
 */

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
} from './graph/graph'

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
    // 共享节点
    FlowConditionNode,
    FlowDelayNode,
    FlowSetVariableNode,
    FlowCallFlowNode,
    FlowSubFlowNode,
    FlowReturnNode,
    FlowForEachNode,
    FlowParallelNode,
    SharedFlowNode,
    // 前端节点
    FlowSetDataNode,
    FlowNavigateNode,
    FlowAnimateNode,
    FlowSetVisibleNode,
    ClientFlowNode,
    // 后端节点
    FlowDbQueryNode,
    FlowDbInsertNode,
    FlowDbUpdateNode,
    FlowDbDeleteNode,
    FlowHttpRequestNode,
    FlowTransformNode,
    FlowScriptNode,
    ServerFlowNode,
    // Schema 结构
    FlowActionNode,
    FlowValueNode,
    FlowVarNode,
    FlowPageVarNode,
    FlowEventParamNode,
    FlowNode,
    FlowEdge,
    FlowSchema,
    // FlowContext
    FlowContext,
    EventHandler,
    IViewEvents,
    IViewLifetimes,
    IAddonBase,
    IBoundingBoxAddon,
    IVertexAddon,
    IBoxDecorationOptions,
    IBoxDecorationAddon,
    IComputedStyle,
    IFillStyleOptions,
    IStrokeStyleOptions,
    IShadowStyleOptions,
    ITextSelectionAddon,
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
    // 流程编辑器（Phase 1.4 将移至 banvas-flow-editor）
    PortDirection,
    IPortView,
    INodeView,
    IEdgeView,
} from './view/view'

export { AddonCapability, Cursor, Action, cursorMap } from './view/view'
export { FLOW_SCHEMA_VERSION } from './view/view'

// ── Camera 接口 ──
export type {
    ICamera,
    IOrthographicCamera,
    IPerspectiveCamera,
} from './engine/camera'

// ── Renderer 接口 ──
export type {
    ICanvasContextOptions,
    ICanvasContext,
    IRendererOptions,
    IRenderer,
} from './engine/renderer'

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
} from './engine/scene'

export { DiffType, Operation } from './engine/scene'

// ── Snap 接口 ──
export { SnapAxis } from './engine/snap'
export type { AxisSnap, SnapResult } from './engine/snap'

// ── App 接口 ──
export type {
    IPage,
    IAppOptions,
    IAppLifetimes,
    INavigationOptions,
    IApp,
    IAppStatic,
} from './engine/app'

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
} from './engine/animation'

// ── 序列化接口 ──
export type { ISerializable, ISerializableClass } from './foundation/serializable'

// ── Worker 传输接口 ──
export type { ITransferable, TransferableData } from './foundation/transferable'

// ── Hook 公共接口 ──
export type {
    IViewActions,
    IPageActions,
    IAppActions,
    IBanvasActions,
} from './hook/hook'

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
} from './material/material'

// ── PropertyAdapter 接口 ──
export type {
    PropertyCategory,
    PropertyAdapter,
    PropertyDescriptor,
    ConflictGroup,
} from './view/property'

// ── 原子事件输入类型 ──
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
} from './foundation/event'

// ── 统一类型守卫 ──
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
} from './guards'
