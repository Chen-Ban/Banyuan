/**
 * 接口层 barrel 导出
 *
 * 所有图形和视图的接口、类型映射、统一类型守卫从这里统一导出。
 * 消费方只需：
 *   import { ILine, isGraphType, GRAPHTYPE } from '@/core/interfaces'
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
} from './IGraph'

export type { TextIndex } from './IGraph'

// ── View 接口 ──
export type {
    FieldType,
    IFieldSchema,
    IFieldSchemaMap,
    FlowValue,
    FlowCondition,
    FlowSetDataNode,
    FlowNavigateNode,
    FlowAnimateNode,
    FlowConditionNode,
    FlowDelayNode,
    FlowSetVisibleNode,
    FlowNode,
    FlowEdge,
    FlowSchema,
    EventHandler,
    IViewEvents,
    IViewLifetimes,
    IAddonBase,
    IBoundingBoxAddon,
    IVertexAddon,
    IViewAddon,
    ExtraData,
    MoveData,
    ResizeData,
    RotateData,
    EditPointData,
    EditViewportData,
    SelectData,
    TextSelectionData,
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
    ICombinedView,
    ISelection,
    IInput,
    ViewTypeMap,
} from './IView'

export { Cursor, Action, cursorMap } from './IView'

// ── Camera 接口 ──
export type {
    ICamera,
    IOrthographicCamera,
    IPerspectiveCamera,
} from './ICamera'

// ── Renderer 接口 ──
export type {
    ICanvasContextOptions,
    ICanvasContext,
    IRendererOptions,
    IRenderer,
} from './IRenderer'

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
} from './IScene'

export { DiffType, Operation } from './IScene'

// ── App 接口 ──
export type {
    AppMode,
    IPage,
    IAppOptions,
    INavigationOptions,
    IApp,
    IAppStatic,
} from './IApp'

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
    IAnimation,
    IAnimationManager,
    IAnimatable,
} from './IAnimation'

// ── 序列化接口 ──
export type { ISerializable, SerializableStatic } from './ISerializable'

// ── Worker 传输接口 ──
export type { ITransferable, TransferableData } from './ITransferable'

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
    IUseBanvasResult,
} from './IHook'

// ── PropertyAdapter 接口 ──
export type {
    PropertyCategory,
    PropertyAdapter,
    PropertyDescriptor,
    ConflictGroup,
} from './IPropertyAdapter'

// ── Worker 接口 ──
export type {
    WorkerTaskType,
    WorkerTask,
    WorkerResult,
} from './IWorker'

// ── Runtime 接口 ──
export type { RuntimeContext } from './IRuntime'

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
    isBoundingBoxAddon,
    isVertexAddon,
} from './guards'
