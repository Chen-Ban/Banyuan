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
    IRectangle,
    IRegularPolygon,
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
    IDiff,
    IOperation,
    IOperationStack,
    IScene,
} from './IScene'

export { OperationType } from './IScene'

// ── App 接口 ──
export type {
    IPage,
    IAppOptions,
    INavigationOptions,
    IApp,
    IAppStatic,
} from './IApp'

// ── 序列化接口 ──
export type { ISerializable, SerializableStatic } from './ISerializable'

// ── Worker 传输接口 ──
export type { ITransferable, TransferableData } from './ITransferable'

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
