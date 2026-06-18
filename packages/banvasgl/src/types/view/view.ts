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

import { ViewType } from "@/foundation/constants";
import type { Matrix4, Point3, Vector3 } from "@/foundation/math";
import type Bounds from "@/graph/base/Bounds";
import type { Line } from "@/graph";
import type {
  IGraph,
  ITextElement,
  ITextFields,
  TextIndex,
} from "../graph/graph";
import type {
  LinearGradient,
  RadialGradient,
  ConicGradient,
} from "@/foundation/style/gradient/index";
import type Image from "@/foundation/style/Image";
// IViewStyle、IComputedStyle 及辅助类型（IFillStyleOptions 等）已迁移到 ./style.ts。
// 此处 import 供文件内部使用，同时 re-export 维持 types/index.ts 导出链。
import type { IComputedStyle, IViewStyle } from "../foundation/style";
export type {
  IComputedStyle,
  IViewStyle,
  IFlexLayout,
  IListLayout,
  IGridLayout,
  IScrollLayout,
  LayoutMode,
  IFillStyleOptions,
  IStrokeStyleOptions,
  IShadowStyleOptions,
  TransformOriginKeyword,
  TransformOrigin,
} from "../foundation/style";

// IAnimationAddon 接口（动画插件，不走管线，由 AnimationManager 驱动）
import type { IAnimationAddon } from "../engine/animation";
export type { IAnimationAddon } from "../engine/animation";

// ────────────────────────────────────────────
//  IFieldSchema —— data 的字段定义
// ────────────────────────────────────────────

/** 字段类型 */
export type FieldType = "string" | "number" | "boolean" | "object";

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
  type: FieldType;
  default: string | number | boolean | object;
  value?: string | number | boolean | object;
}

/** 字段定义表 —— View.data 的实际类型 */
export type IFieldSchemaMap = Record<string, IFieldSchema>;

// ────────────────────────────────────────────
// ────────────────────────────────────────────
//  Flow 类型 —— 从内部 flow 模块统一重导出（v2.0.0）
// ────────────────────────────────────────────

export type {
  // source
  FlowSourceNode,
  FlowLiteralSourceNode,
  FlowContextSourceNode,
  // compute
  FlowComputeNode,
  FlowMathNode,
  FlowCompareNode,
  FlowLogicNode,
  FlowConcatNode,
  FlowFormatNode,
  FlowGetNode,
  // control
  FlowControlNode,
  FlowConditionNode,
  FlowLoopNode,
  FlowParallelNode,
  // function
  FlowFunctionNode,
  FlowLocalFunctionNode,
  // action
  FlowActionNode,
  FlowSetVariableNode,
  FlowNavigateNode,
  FlowHttpRequestNode,
  FlowDbQueryNode,
  FlowDbInsertNode,
  FlowDbUpdateNode,
  FlowDbDeleteNode,
  // Schema
  FlowNode,
  FlowSchema,
  DataRef,
  NodeCategory,
} from "@/types/foundation/flow/index.js";

// FLOW_SCHEMA_VERSION / FlowEnv —— 从 types 模块导出
export type { FlowEnv } from "@/types/foundation/flow/context.js";

// 文件内使用（EventHandler 等需要引用 FlowSchema）
import type { FlowSchema } from "@/types/foundation/flow/index.js";

// ────────────────────────────────────────────
//  IViewEvents / IViewLifetimes —— 事件与生命周期
// ────────────────────────────────────────────

/**
 * 事件处理器 —— 可视化编排的结构化描述，或未绑定（null）
 *
 * 用户通过可视化面板编排动作流，引擎在运行时将 FlowSchema 编译执行。
 * 不支持手写脚本字符串，所有逻辑均通过 FlowSchema 节点表达。
 */
export type EventHandler = FlowSchema | null;

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
  onClick: EventHandler;
  onDoubleClick: EventHandler;
  onContextMenu: EventHandler;
  // 鼠标移动类
  onMouseEnter: EventHandler;
  onMouseLeave: EventHandler;
  onMouseMove: EventHandler;
  onMouseDown: EventHandler;
  onMouseUp: EventHandler;
  // 拖拽类
  onDragStart: EventHandler;
  onDrag: EventHandler;
  onDragEnd: EventHandler;
  // 焦点类
  onFocus: EventHandler;
  onBlur: EventHandler;
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
  onCreated: EventHandler;
  onAttach: EventHandler;
  onDestroy: EventHandler;
}

// ────────────────────────────────────────────
//  IView —— View 的公共接口
// ────────────────────────────────────────────

/** View 公共契约 —— 所有视图的统一接口 */
export interface IView {
  id: string;
  readonly type: ViewType;
  parent: ISceneNode | IView | null;
  matrix: Matrix4;
  content: IGraph | null;
  viewport: Bounds;
  layoutArea: Bounds;
  boundingBox: IBoundingBoxAddon | null;
  /** 视觉装饰插件（背景、边框、圆角、裁剪），按需挂载 */
  decoration: IBoxDecorationAddon | null;
  /** 动画插件（关键帧动画驱动），按需挂载，不参与渲染/交互管线 */
  animation: IAnimationAddon | null;

  // 状态
  selected: boolean;
  actived: boolean;
  freezed: boolean;
  visible: boolean;

  // 样式
  style: IViewStyle;

  // 布局与渲染
  layoutContent(ctx?: CanvasRenderingContext2D): Bounds;
  renderContent(ctx: CanvasRenderingContext2D): void;
  layout(ctx?: CanvasRenderingContext2D): Bounds;
  render(): void;
  copy(): IView;

  // 交互
  interact(worldPoint: Point3): IInteractResult;

  // 数据
  data: IFieldSchemaMap;
  /**
   * 设置运行时字段值
   *
   * 只写入各字段的 value，不修改 default 和 type。
   * key 不存在于 data 中时静默忽略。
   *
   * @param values  { [fieldKey]: 新值 }
   */
  setData(values: Record<string, string | number | boolean | object>): void;

  // 事件与生命周期
  events: IViewEvents;
  lifetimes: IViewLifetimes;

  // 变换
  resize(
    fixedPoint: Point3,
    dynamicPoint: Point3,
    vector: Vector3,
    needResizeContent?: boolean,
  ): void;
  getWorldMatrix(parent?: IView): Matrix4;
  getMVPMatrix(): Matrix4;
  setVPMatrix(vpMatrix: Matrix4): void;
  translate(x: number, y: number, z?: number): IView;
  scale(x: number, y: number, z?: number, origin?: Point3): IView;
  rotate(x: number, y: number, z: number, origin?: Point3): IView;

  // 状态切换
  setActived(actived: boolean): IView;
  setSelected(selected: boolean): IView;
  setVisible(visible: boolean): IView;
  setFreezed(freezed: boolean): IView;

  // 生命周期
  onAttach(): void;
  onDestroy(): void;
  destroy(): void;

  // 辅助
  getSnapObjects(): [Point3[], Line[]];
}

// ────────────────────────────────────────────
//  ISceneNode —— Scene 作为"容器节点"的接口
// ────────────────────────────────────────────
export interface ISceneNode {
  id: string;
  children: IView[];
  data: any;
}

// ────────────────────────────────────────────
//  Addon 接口 —— 定义在 ./addon.ts，此处 re-export
// ────────────────────────────────────────────
// AddonCapability 为枚举值，归属 foundation/constants，由 src/index.ts 直接导出。

export type {
  IAddonBase,
  ITextSelection,
  ITextSelectionAddon,
  IBoundingBoxAddon,
  IVertexAddon,
  IBoxDecorationOptions,
  IBoxDecorationAddon,
  IViewAddon,
} from "./addon";

// 文件内使用（IView 等引用 addon 接口）
import type {
  IBoundingBoxAddon,
  IVertexAddon,
  IBoxDecorationAddon,
  IBoxDecorationOptions,
  IViewAddon,
  ITextSelection,
} from "./addon";

// ────────────────────────────────────────────
//  交互类型（定义在 ./interaction.ts，此处 re-export）
// ────────────────────────────────────────────
// Cursor / cursorMap / Action 为值，归属 foundation/constants，由 src/index.ts 直接导出。
export type {
  MoveData,
  ResizeData,
  RotateData,
  EditPointData,
  EditViewportData,
  SelectData,
  TextSelectionData,
  ConnectData,
  NoneData,
  ExtraData,
} from "./interaction";
import type { ExtraData } from "./interaction";

/** View 交互结果 */
export interface IInteractResult {
  view: IView | null;
  content: IGraph | IViewAddon | null;
  extraData: ExtraData | null;
}

/** View 构造选项 —— 纯数据接口，不依赖具体 View 类 */
export interface IViewOptions<D extends IFieldSchemaMap = any> {
  id?: string;
  name?: string;
  content?: IGraph;
  children?: IView[];
  parent?: ISceneNode | IView;
  data?: D;
  style?: IViewStyle;
  matrix?: Matrix4;
  lifetimes?: Partial<IViewLifetimes>;
  events?: Partial<IViewEvents>;
  decoration?: IBoxDecorationOptions;
}

/** ContainerView 构造选项 */
export interface IContainerViewOptions<
  D extends IFieldSchemaMap = any,
> extends IViewOptions<D> {
  children?: IView[];
}

/** GraphView 构造选项（content 由构造函数单独传入） */
export interface IGraphViewOptions extends Omit<IViewOptions, "content"> {}

/** SelectBoxView 构造选项 */
export interface ISelectBoxViewOptions extends IGraphViewOptions {}

/** ImageView 构造选项（content 由构造函数单独传入） */
export interface IImageViewOptions extends Omit<IViewOptions, "content"> {}

/** VideoView 构造选项（content 由构造函数单独传入） */
export interface IVideoViewOptions extends Omit<IViewOptions, "content"> {}

/** TextView 构造选项（content 由构造函数单独传入） */
export interface ITextViewOptions extends Omit<IViewOptions, "content"> {
  editable?: boolean;
  verticalAlign?: string;
}

// TransformOriginKeyword、TransformOrigin、IFillStyleOptions、IStrokeStyleOptions、
// IShadowStyleOptions、IViewStyle、IComputedStyle 已迁移到 ./style.ts，
// 顶部已 re-export，外部消费者行为不变。

// ────────────────────────────────────────────
//  具体 View 接口
// ────────────────────────────────────────────

/** GraphView 接口 */
export interface IGraphView extends IView {
  content: IGraph;
  controlPoints: IVertexAddon | null;
}

/** SelectBoxView 接口 */
export interface ISelectBoxView extends IView {
  content: IGraph;
  updateSelect(anchorPoint: Point3, dynamicPoint: Point3): void;
}

/** ImageView 接口 */
export interface IImageView extends IView {}

/** VideoView 接口 */
export interface IVideoView extends IView {}

// ITextSelection 已迁移至 ./addon.ts，通过顶部 re-export 导出

/** TextView 接口 */
export interface ITextView extends IView {
  content: ITextFields;
  editable: boolean;
  selection: ITextSelection;

  // 文本编辑能力
  getContentText(): string[];
  constraintPoint(relativePoint: Point3): Point3;
  element2Index(textElement: ITextElement, p: Point3): TextIndex;
  setSelection(
    fixedIndex: TextIndex | undefined,
    dynamicIndex: TextIndex | undefined,
  ): void;
  input(content: string, isComposition: boolean): void;
  delete(isBackspace: boolean): void;
  newLine(): void;
}

/**
 * ContainerView 接口 —— 拥有子节点管理能力的容器视图
 *
 * 只有容器类型的 View（CombinedView、NodeView）实现此接口。
 * 叶子视图（GraphView、TextView 等）不实现此接口，其 children 始终为空数组。
 */
export interface IContainerView extends IView {
  readonly children: IView[];
  addChild(child: IView): void;
  removeChild(child: IView): void;
  clear(): void;
}

/** CombinedView 接口 —— 统一容器，通过 style.layoutMode 切换布局模式 */
export interface ICombinedView extends IContainerView {
  /** 是否为布局托管容器（layoutMode 为 flex/list/grid 时为 true） */
  readonly isLayoutManaged: boolean;
}

// ────────────────────────────────────────────
//  流程编辑器 View 接口（Phase 1.4 将移至 banvas-flow-editor）
// ────────────────────────────────────────────

/** 端口方向 */
export type PortDirection = "input" | "output" | "bidirectional";

/** PortView 接口 */
export interface IPortView extends IView {
  portDirection: PortDirection;
  /** 该端口允许的最大连线数（默认 1，Infinity 表示无限制） */
  maxConnections: number;
  /** 获取端口世界坐标中心点 */
  getWorldCenter(): Point3;
}

/** NodeView 接口 */
export interface INodeView extends IContainerView {
  /** 节点标题 */
  nodeTitle: string;
}

/** EdgeView 接口 */
export interface IEdgeView extends IView {
  fromPortId: string | null;
  toPortId: string | null;
  /** 连线拖拽中：更新临时终点坐标 */
  setTempTarget(point: Point3): void;
  /** 完成连线，绑定源端口和目标端口 */
  connect(fromPortId: string, toPortId: string): void;
}

// ────────────────────────────────────────────
//  ViewTypeMap —— 枚举值 → 接口 + 窄 type 的映射
// ────────────────────────────────────────────

export interface ViewTypeMap {
  [ViewType.VIEW]: IView;
  [ViewType.GRAPHVIEW]: IGraphView & {
    readonly type: typeof ViewType.GRAPHVIEW;
  };
  [ViewType.SELECTBOXVIEW]: ISelectBoxView & {
    readonly type: typeof ViewType.SELECTBOXVIEW;
  };
  [ViewType.IMAGEVIEW]: IImageView & {
    readonly type: typeof ViewType.IMAGEVIEW;
  };
  [ViewType.VIDEOVIEW]: IVideoView & {
    readonly type: typeof ViewType.VIDEOVIEW;
  };
  [ViewType.TEXTVIEW]: ITextView & { readonly type: typeof ViewType.TEXTVIEW };
  [ViewType.COMBINEDVIEW]: ICombinedView & {
    readonly type: typeof ViewType.COMBINEDVIEW;
  };
  [ViewType.EDITABLETEXT]: ITextView & {
    readonly type: typeof ViewType.EDITABLETEXT;
  };
}
