/**
 * 交互状态机 —— 类型定义
 *
 * 设计原则：
 * 1. InteractionState 是判别联合，任何时刻系统处于且仅处于一个状态
 * 2. 每个状态携带该模式所需的全部上下文（消除散碎 refs）
 * 3. InteractionDelegate 是操作注入点，状态机本身不操作引擎
 */

import type {
  Point3,
  Vector3,
  View,
  IGraph,
  IViewAddon,
  ExtraData,
  Cursor,
  SelectBoxView,
  EdgeView,
  TextIndex,
} from "@banyuan/banvasgl";

// ────────────────────────────────────────────
//  重导出原子事件输入类型（方便状态机内部使用）
// ────────────────────────────────────────────

export type {
  PointerInputBase,
  PointerDownInput,
  PointerMoveInput,
  PointerUpInput,
  PointerCancelInput,
  KeyDownInput,
  KeyUpInput,
  InteractionInput,
} from "@banyuan/banvasgl";

// ────────────────────────────────────────────
//  交互能力集
// ────────────────────────────────────────────

/** 可配置的交互能力 */
export type InteractionCapability =
  | "pan"
  | "move"
  | "resize"
  | "rotate"
  | "connect"
  | "box-select"
  | "text-selection"
  | "edit-point"
  | "drop";

// ────────────────────────────────────────────
//  Hover 命中目标
// ────────────────────────────────────────────

/** Hover 检测的命中结果 */
export interface HoverTarget {
  view: View;
  content: IGraph | IViewAddon;
  action: number; // Action enum value
  extraData: ExtraData;
  cursor: Cursor;
}

// ────────────────────────────────────────────
//  交互状态（判别联合）
// ────────────────────────────────────────────

/** 空闲状态 —— 未按下鼠标，未命中任何目标 */
export interface IdleState {
  readonly mode: "idle";
}

/** 悬停状态 —— 未按下鼠标，但命中了某个交互目标 */
export interface HoverState {
  readonly mode: "hover";
  readonly target: HoverTarget;
}

/** 平移状态 —— Space+拖拽 或 中键拖拽 */
export interface PanningState {
  readonly mode: "panning";
  startClient: { x: number; y: number };
}

/** 移动状态 —— 拖动视图 */
export interface MovingState {
  readonly mode: "moving";
  readonly startPoint: Point3;
  lastPoint: Point3;
  readonly indicateView: View;
}

/** 缩放状态 —— 拖动 handle 缩放视图 */
export interface ResizingState {
  readonly mode: "resizing";
  readonly startPoint: Point3;
  lastPoint: Point3;
  readonly indicateView: View;
  readonly fixedIndex: number;
  readonly dynamicIndex: number;
}

/** 旋转状态 —— 拖动旋转手柄 */
export interface RotatingState {
  readonly mode: "rotating";
  readonly startPoint: Point3;
  lastPoint: Point3;
  readonly indicateView: View;
}

/** 连线状态 —— 从端口拖出连线 */
export interface ConnectingState {
  readonly mode: "connecting";
  readonly fromPortId: string;
  readonly tempEdge: EdgeView;
}

/** 框选状态 —— 在空白区域拖出选择框 */
export interface BoxSelectingState {
  readonly mode: "box-selecting";
  readonly startPoint: Point3;
  readonly selectBox: SelectBoxView;
}

/** 文本选择状态 —— 在文本视图中拖选文字 */
export interface TextSelectingState {
  readonly mode: "text-selecting";
  readonly indicateView: View;
  readonly indicateContent: IGraph | IViewAddon;
}

/** 编辑控制点状态 —— 拖动顶点 */
export interface EditingPointState {
  readonly mode: "editing-point";
  readonly startPoint: Point3;
  lastPoint: Point3;
  readonly indicateView: View;
  readonly extraData: ExtraData;
}

/** 所有交互状态的联合类型 */
export type InteractionState =
  | IdleState
  | HoverState
  | PanningState
  | MovingState
  | ResizingState
  | RotatingState
  | ConnectingState
  | BoxSelectingState
  | TextSelectingState
  | EditingPointState;

/** 从联合中提取特定模式的状态类型 */
export type StateOfMode<M extends InteractionState["mode"]> = Extract<
  InteractionState,
  { mode: M }
>;

// ────────────────────────────────────────────
//  状态机输出（副作用描述）
// ────────────────────────────────────────────

export interface InteractionOutput {
  /** 应设置的鼠标光标（undefined 表示不变） */
  cursor?: Cursor | string;
  /** 状态是否发生了变化 */
  stateChanged: boolean;
  /** 是否需要通知外层重渲染（通常在 mouseUp/完成操作后） */
  shouldNotify?: boolean;
}

// ────────────────────────────────────────────
//  Delegate —— 状态机向外请求操作的接口
// ────────────────────────────────────────────

/**
 * InteractionDelegate —— 状态机与宿主环境之间的操作契约。
 *
 * 设计目的：
 *   状态机（InteractionStateMachine）是纯逻辑类，零 React、零 DOM 依赖。
 *   它通过 delegate 接口声明自己需要的全部外部能力，由宿主在实例化时注入实现。
 *
 * 为什么不直接传 actions？
 *   1. 解耦 —— 状态机不依赖 IBanvasActions 的具体形态，可在非 React 宿主（Node 测试、
 *      Vue 移植等）中复用。
 *   2. 可测试 —— 测试时只需 mock 此接口，无需构造完整的 actions 对象。
 *   3. 显式依赖 —— delegate 接口精确列出状态机所需的全部能力，任何新增需求都会
 *      体现在接口变更上，方便 code review。
 *   4. 适配层 —— 部分方法并非简单转发：hitTest 做结果结构转换、finishConnect 包含
 *      业务校验逻辑、resolveActivationTarget 做容器层级穿透等。这些策略不应下沉到
 *      状态机中，delegate 是它们的自然归属。
 *
 * 对于「只是简单转发 actions 方法」的 delegate 成员（select/deselect/translateActived 等），
 * 保留它们是为了维持依赖边界的完整性和一致性，避免状态机部分直接引用 actions、部分走 delegate
 * 的混合模式。
 */
export interface InteractionDelegate {
  // ── 命中检测（含结构转换逻辑） ──
  hitTest(worldPoint: Point3): HoverTarget | null;

  // ── 选择 ──
  select(viewId: string, multiple?: boolean): void;
  deselect(): void;
  getAllActivedViews(): View[];

  // ── 移动 ──
  translateActived(dx: number, dy: number): void;
  snapAlignBegin(): void;
  snapAlignSnap(viewId: string): { offsetX: number; offsetY: number };
  snapAlignEnd(): void;

  // ── 缩放 ──
  resize(
    view: View,
    fixedPoint: Point3,
    dynamicPoint: Point3,
    vector: Vector3,
    proportional: boolean,
  ): void;

  // ── 旋转 ──
  rotate(view: View, angle: number, center: Point3): void;

  // ── 编辑顶点 ──
  editPoint(view: View, point: Point3, delta: Vector3): void;

  // ── 文本选择 ──
  textInteract(
    view: View,
    point: Point3,
    bufferCtx: CanvasRenderingContext2D,
  ): { content: IGraph | IViewAddon | null };
  element2Index(
    view: View,
    content: IGraph | IViewAddon,
    point: Point3,
  ): TextIndex;
  setSelection(view: View, fixedIndex: TextIndex | undefined, dynamicIndex: TextIndex | undefined): void;

  // ── 框选 ──
  createSelectBox(startPoint: Point3): SelectBoxView;
  addTempChild(view: View): void;
  removeTempChild(view: View): void;
  getTopLevelViews(): View[];

  // ── 连线（含业务校验：端口方向 / 同节点禁连 / maxConnections） ──
  createTempEdge(fromPortId: string): EdgeView;
  setTempTarget(edge: EdgeView, point: Point3): void;
  finishConnect(edge: EdgeView, point: Point3): void;

  // ── Pan ──
  panStart(clientX: number, clientY: number): boolean;
  /**
   * 平移中（签名已简化：画布尺寸由 Delegate 内部持有，不再从原子事件传入）
   */
  panMove(clientX: number, clientY: number): boolean;
  panEnd(): boolean;
  isSpaceHeld(): boolean;
  setSpaceHeld(held: boolean): void;

  // ── 画布环境上下文 ──
  /** 获取画布逻辑尺寸（canvasWidth 外移后由 Delegate 提供） */
  getCanvasSize(): { width: number; height: number };

  // ── 事务 ──
  beginTransaction(viewIds: string[]): void;
  commitTransaction(): void;

  // ── 辅助（含容器层级穿透逻辑） ──
  getBufferCtx(): CanvasRenderingContext2D | null;
  resolveActivationTarget(view: View): View;
}

// ────────────────────────────────────────────
//  状态机配置
// ────────────────────────────────────────────

export interface InteractionStateMachineConfig {
  /** 启用的交互能力集 */
  capabilities: readonly InteractionCapability[];
}
