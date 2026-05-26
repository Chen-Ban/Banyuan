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
    // Flow 类型（从 @banyuan/flow 统一透传）
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
    IInputOptions,
    IFlexViewOptions,
    IViewStyle,
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
    IFlexLayoutParams,
    IFlexStyle,
    IFlexView,
    ITextSelection,
    IInput,
    ViewTypeMap,
    // 流程编辑器（Phase 1.4 将移至 banvas-flow-editor）
    PortDirection,
    IPortView,
    INodeView,
    IEdgeView,
} from './view/view'

export { AddonCapability, Cursor, Action, cursorMap } from './view/view'

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
    IAnimatable,
} from './engine/animation'

// ── 序列化接口 ──
export type { ISerializable, ISerializableClass } from './foundation/serializable'

// ── Worker 传输接口 ──
export type { ITransferable, TransferableData } from './foundation/transferable'

// ── Hook 公共接口 ──
export type {
    IComponentTemplate,
    ComponentIcon,
    ComponentSource,
    IComponentDefinition,
    IViewNode,
    IPageNode,
    IViewActions,
    IPageActions,
    IAppActions,
    IHistoryActions,
    IBanvasActions,
    IContextMenuItem,
    IContextMenuState,
    IDragProps,
    IUseBanvasResult,
} from './hook/hook'

// ── PropertyAdapter 接口 ──
export type {
    PropertyCategory,
    PropertyAdapter,
    PropertyDescriptor,
    ConflictGroup,
} from './view/property'

// ── Runtime 接口 ──
export type { ISchemaRunner, SchemaRunInput } from '@/engine/SchemaRunner'
export { setSchemaRunner, getSchemaRunner } from '@/engine/SchemaRunner'

// ── 统一类型守卫 ──
export {
    isGraphType,
    isViewType,
    isCombinedGraph,
    isAnalyticGraph,
    isMediaElement,
    isTextView,
    isSelectBoxView,
    isCombinedView,
    isContainerView,
    isFlexView,
    isBoundingBoxAddon,
    isVertexAddon,
    isBoxDecorationAddon,
    // 流程编辑器（Phase 1.4 将移至 banvas-flow-editor）
    isPortView,
    isNodeView,
    isEdgeView,
} from './guards'
