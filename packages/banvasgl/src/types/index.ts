/**
 * 接口层 barrel 导出
 *
 * 所有图形和视图的接口、类型映射、统一类型守卫从这里统一导出。
 * 消费方只需：
 *   import { ILine, isGraphType, GRAPHTYPE } from '@/types'
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
} from './graph'

export type { TextIndex } from './graph'

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
    IBoxDecorationAddon,
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
    ISelection,
    IInput,
    ViewTypeMap,
    // 流程编辑器（Phase 1.4 将移至 banvas-flow-editor）
    PortDirection,
    IPortView,
    INodeView,
    IEdgeView,
} from './view'

export { Cursor, Action, cursorMap } from './view'

// ── Camera 接口 ──
export type {
    ICamera,
    IOrthographicCamera,
    IPerspectiveCamera,
} from './camera'

// ── Renderer 接口 ──
export type {
    ICanvasContextOptions,
    ICanvasContext,
    IRendererOptions,
    IRenderer,
} from './renderer'

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
} from './scene'

export { DiffType, Operation } from './scene'

// ── App 接口 ──
export type {
    IPage,
    IAppOptions,
    INavigationOptions,
    IApp,
    IAppStatic,
} from './app'

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
    IAnimationManager,
    IAnimatable,
} from './animation'

// ── 序列化接口 ──
export type { ISerializable, SerializableStatic } from './serializable'

// ── Worker 传输接口 ──
export type { ITransferable, TransferableData } from './transferable'

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
    IHistoryActions,
    IBanvasActions,
    IContextMenuItem,
    IContextMenuState,
    IDragProps,
    IUseBanvasResult,
} from './hook'

// ── PropertyAdapter 接口 ──
export type {
    PropertyCategory,
    PropertyAdapter,
    PropertyDescriptor,
    ConflictGroup,
} from './property'

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
