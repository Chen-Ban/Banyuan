import { ViewType, Action, AddonCapability, Cursor } from "@/foundation/constants";
import Matrix4 from "@/foundation/math/Matrix4";
import type { IDrawingSurface } from "@/types/platform/surface.js";
import type { IDrawingContext } from '@/types/platform/drawing.js'
import type { IGradient } from '@/types/foundation/gradient.js'
import type { IPattern } from '@/types/foundation/pattern.js';
import type { ISceneNode, IView, IFieldSchemaMap, IInteractResult, IViewOptions, IViewEvents, IViewLifetimes } from '@/types/view/view'
import type { IViewStyle } from '@/types/foundation/style'
import type { ISerializable } from '@/types/foundation/serializable'
import type { IGraph } from '@/types/graph/graph'
import type { IAddonBase, IBoundingBoxAddon, IBoxDecorationAddon } from '@/types/view/addon'
import type { IAnimationAddon, AnimatableValue } from '@/types/foundation/animation'

import { Line } from "@/graph";
import { getDefaultStyle } from "@/graph/DefaultStyleRegistry";
import { BoundingBoxAddon, BoxDecorationAddon } from "@/view/addon";
import { Point3, Vector3 } from "@/foundation/math";
import Bounds from "@/graph/base/Bounds";
import { Scene } from "@/engine/scene/Scene";
import {
  RESIZE_SIZE_MAP,
  RESIZE_ORIGIN_MAP,
  createDefaultEvents,
  createDefaultLifetimes,
  createDefaultViewStyle,
} from "./constant.js";
import { calculateDimensionDelta } from "./utils.js";

/**
 * 视图抽象基类
 *
 * `View` 是 BanvasGL 中所有可视元素的抽象基类，
 * 定义了渲染、布局、交互和序列化的统一接口。
 *
 * 在 BanvasGL 分层架构中的位置：
 * `types` → `foundation` → `graph` → **`view`** → `engine`
 *
 * View 是一个带有流程控制语义的富对象：
 * - **流程控制**：`events`（12 个事件处理器）+ `lifetimes`（3 个生命周期钩子），类型为 `FlowSchema | null`
 * - **插件管线**：可扩展的插件系统（BoundingBox、BoxDecoration、Animation、Vertex、TextSelection）
 * - **布局系统**：viewport + constraintBounds + layoutArea，基于双脏标记的延迟布局
 *   （_styleDirty → repaint；_layoutDirty → reflow）
 * - **样式管线**：resolveVisualStyle（阶段 A）→ layout → resolveLayoutStyle（阶段 B）→ render
 * - **渲染管线**：decoration 背景 → clip → 内容 + 子节点 → 插件
 * - **交互管线**：插件 → 内容 → 子节点（按优先级）
 *
 * 子类包括：
 * - `GraphView`：单图形叶子视图
 * - `ContainerView`（`CombinedView`、`FlexView`）：带子节点的容器视图
 * - `NodeView`、`EdgeView`、`PortView`：流程图视图
 *
 * @example
 * ```typescript
 * // View 不可直接实例化，需通过子类使用
 * const graphView = new GraphView({ id: 'v1', style: { width: 100, height: 50 } });
 * const flexView = new FlexView({ id: 'v2', style: { width: 300, height: 200, flexLayout: { direction: 'row' } } });
 * ```
 */
export default abstract class View<D extends IFieldSchemaMap = IFieldSchemaMap>
  implements IView, ISerializable
{
  // ── 调试开关 ──

  /**
   * localStorage key，用于持久化「布局边界调试线框」开关。
   *
   * 在浏览器控制台执行以下命令可即时开启/关闭，无需重启：
   *   开启：localStorage.setItem('banvasgl:debug:layoutBounds', '1')
   *   关闭：localStorage.removeItem('banvasgl:debug:layoutBounds')
   */
  public static readonly DEBUG_LAYOUT_BOUNDS_KEY = 'banvasgl:debug:layoutBounds';

  /**
   * 调试开关（只读，实时读取 localStorage）：
   * 开启后在 renderToOffScreen 末尾用不同颜色线框渲染
   * viewport（红色实线）/ layoutArea（绿色虚线）/ constraintBounds（蓝色点线），
   * 用于可视化布局几何关系。
   *
   * 通过 localStorage 控制，每帧实时读取，无需刷新页面即可生效。
   */
  public static get DEBUG_LAYOUT_BOUNDS(): boolean {
    try {
      return localStorage.getItem(View.DEBUG_LAYOUT_BOUNDS_KEY) === '1';
    } catch {
      // SSR / 隐私模式等无法访问 localStorage 的环境，静默降级为关闭
      return false;
    }
  }

  // ── 标识 ──

  /** 视图唯一标识符 */
  public id: string = "";

  /** 可读名称（可选，用于编辑器 UI 展示） */
  public name: string = "";

  /** 视图类型标识，由子类确定 */
  public abstract readonly type: ViewType;

  // ── 数据 ──

  /**
   * 运行时数据字段（键值 Schema 映射）
   *
   * 每个字段具有 `{ type, value, default }` 结构；使用 `setData()` 更新 value。
   */
  public data: D = {} as D;

  // ── 内容 ──

  /**
   * 作为视图内容渲染的图形基元（如 Line、Arc、Text）
   *
   * 对于仅包含子节点的容器视图，可为 `null`。
   */
  public content: IGraph | null;

  // ── 层级关系 ──

  /**
   * 父节点引用（Scene 根节点或父 View）
   *
   * 由引擎在视图挂载到场景树时设置。
   */
  public parent: ISceneNode | View | null = null;

  // ── 事件与生命周期 ──

  /**
   * 绑定到此视图的事件处理器（onClick、onLongPress、onChange 等）
   *
   * 每个处理器为 `FlowSchema | null`；引擎的 FlowRunner 执行绑定的流程。
   */
  public events: IViewEvents = createDefaultEvents();

  /**
   * 生命周期钩子（onCreated、onAttach、onDestroy）
   *
   * `onCreated` 在首次挂载时触发一次，随后置为 `null`。
   */
  public lifetimes: IViewLifetimes = createDefaultLifetimes();

  // ── 样式与状态 ──

  /**
   * 视图样式配置（width、height、flexLayout、overflow 等）
   *
   * 构造时由默认值 + 用户传入的 options 二层合并而成。
   */
  public style: IViewStyle = {};

  /** 是否在编辑器中处于选中状态 */
  public selected: boolean = false;

  /** 是否在编辑器中处于激活（聚焦）状态 */
  public actived: boolean = false;

  /** 是否被冻结（锁定，不可编辑） */
  public freezed: boolean = false;

  /** 渲染时是否可见 */
  public visible: boolean = true;

  // ── 变换 ──

  /**
   * 本地变换矩阵（平移、旋转、缩放）
   *
   * 世界矩阵 = 父节点世界矩阵 × 本地矩阵。
   */
  public matrix: Matrix4 = Matrix4.identity();

  /**
   * VP（视图-投影）矩阵缓存，由 Scene 在每帧渲染前设置。
   * 内部用于计算 MVP 矩阵以进行渲染和交互。
   */
  private _vpMatrix: Matrix4 = Matrix4.identity();

  // ── 插件 ──

  /** 包围盒插件：提供选中手柄以进行缩放 */
  public boundingBox: IBoundingBoxAddon | null = null;

  /**
   * 盒装饰插件：视觉装饰（背景/边框/圆角/滚动）
   *
   * 不直接参与交互检测。
   */
  public decoration: IBoxDecorationAddon | null = null;

  /**
   * 动画插件：关键帧动画驱动器
   *
   * 在播放期间提供动画属性值以覆盖静态属性。
   */
  public animation: IAnimationAddon | null = null;

  // ── 布局 ──

  /**
   * 视图自身的矩形区域（位置 + 尺寸）
   *
   * 这是主要的几何描述；boundingBox、layoutArea 和 constraintBounds
   * 都由 viewport 派生或与之关联。
   */
  public viewport: Bounds;

  /**
   * 内容布局区域：viewport、内容 bounds 和子节点 bounds 的联合。
   *
   * 表示实际渲染内容的范围（overflow 时可能超出 viewport）。
   */
  public layoutArea: Bounds;

  /** 约束边界：由父容器传递下来，限制内容的布局空间 */
  public constraintBounds: Bounds = Bounds.empty();

  /** 布局脏标记：为 `true` 时下次渲染前将重新执行布局（reflow） */
  protected _layoutDirty: boolean = true;

  /** 样式脏标记：为 `true` 时下次渲染前将重新解析视觉样式（repaint） */
  protected _styleDirty: boolean = true;

  // ── 抽象方法 ──

  /**
   * 创建当前视图的深拷贝
   *
   * @returns 所有属性都被深拷贝的新 View 实例
   */
  public abstract copy(): View;

  // ══════════════════════════════════════════════════════════════════════════════
  // 构造函数
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * 从 options 构造 View 实例
   *
   * 初始化所有属性，设置 viewport 和布局区域，
   * 创建默认插件（BoundingBox，可选 Decoration）。
   * 布局延迟到首帧渲染时执行（通过 `_layoutDirty` 标记）。
   *
   * @param options - 视图构造选项（id、style、content、parent、events、lifetimes 等）
   */
  constructor(options: IViewOptions<D>) {
    // 标识与数据
    this.id = options.id || "";
    this.data = options.data || ({} as D);

    // 样式：二层合并（默认值 ← 用户传入）
    this.style = {
      ...createDefaultViewStyle(),
      ...(options.style || {}),
    };

    // 变换与层级
    this.matrix = options.matrix ?? Matrix4.identity();
    this.content = options.content ?? null;
    this.parent = (options.parent ?? null) as ISceneNode | View | null;

    // 生命周期与事件绑定
    if (options.lifetimes) {
      Object.assign(this.lifetimes, options.lifetimes);
    }
    if (options.events) {
      Object.assign(this.events, options.events);
    }

    // 布局初始化
    // 步骤1：从样式尺寸初始化视口
    this.viewport = new Bounds(
      0,
      0,
      options.style?.width || 0,
      options.style?.height || 0,
    );
    this.boundingBox = new BoundingBoxAddon(this.viewport);

    // 步骤1.5：若提供了装饰配置则初始化装饰插件
    if (options.decoration) {
      this.decoration = new BoxDecorationAddon(options.decoration);
    }

    // 步骤2：初始化布局区域（使用视口大小作为初始值）
    this.layoutArea = this.viewport.copy();

    // 步骤3：初始化约束边界（父容器的布局约束）
    this.constraintBounds = this.viewport.copy();

    // 步骤4：布局延迟到首帧渲染（_layoutDirty 初始为 true）
    // onCreated 延迟到 onAttach() 中触发（挂载到 Scene 后执行）
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // 计算属性
  // ══════════════════════════════════════════════════════════════════════════════

  /** 渲染时使用的视口：动画覆盖层的视口优先，否则取真实 viewport */
  get renderViewport(): Bounds {
    return this.animation?.resolveAnimatedViewport() ?? this.viewport;
  }

  /**
   * 获取当前 View 实例上所有活跃的 addon 列表。
   *
   * 子类通过 override 此 getter 追加自己的 addon（如 GraphView 追加 VertexAddon）。
   * 管线（renderPlugins / interactPlugins）统一遍历此列表，
   * 根据 `addon.capabilities` 决定是否调用 render/interact，
   * 按 `addon.priority` 排序执行（数值越小越先执行）。
   * 同时供动画系统属性查找链使用（遍历 addon 查找 direct 属性的宿主）。
   *
   * @example
   * ```ts
   * // GraphView 中追加 VertexAddon
   * public override get activeAddons(): IAddonBase[] {
   *   return [...super.activeAddons, this.controlPoints].filter(Boolean)
   * }
   * ```
   */
  public get activeAddons(): IAddonBase[] {
    const addons: IAddonBase[] = [];
    if (this.decoration) addons.push(this.decoration);
    if (this.boundingBox) addons.push(this.boundingBox);
    return addons;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // 场景与层级
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * 沿 parent 链向上查找并返回当前 View 所属的 Scene。
   *
   * 若 View 尚未挂载（如构造阶段），返回 `null`。
   *
   * @returns 所属 Scene，未挂载时返回 `null`
   */
  public getScene(): Scene | null {
    let node: unknown = this.parent;
    while (node && !("camera" in (node as object))) {
      node = (node as { parent?: unknown }).parent;
    }
    return (node as Scene | null) ?? null;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // 数据
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * 设置运行时字段值
   *
   * 仅写入每个字段的 `value`，不修改 `default` 或 `type`。
   * 不存在于 `data` 中的 key 会被静默忽略。
   *
   * @param values - 要设置的键值对
   */
  public setData(
    values: Record<string, string | number | boolean | object>,
  ): void {
    const data = this.data as IFieldSchemaMap;
    for (const key of Object.keys(values)) {
      if (key in data) {
        data[key] = { ...data[key], value: values[key] };
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // 动画
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * 获取属性的动画值（动画值优先于静态值）
   *
   * 委托给 AnimationAddon；若无动画插件则返回 `undefined`。
   *
   * @param prop - 要查询的属性名
   * @returns 动画值，若未处于动画中则返回 `undefined`
   */
  public getAnimatedValue(prop: string): AnimatableValue | undefined {
    return this.animation?.getAnimatedValue(prop);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // 插件管线
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * 执行 addon 交互管线
   *
   * 仅在视图处于 `actived` 状态时生效。
   * 按优先级遍历具有 `INTERACT` 能力的 addon；
   * 返回第一个报告命中的 addon 结果。
   *
   * @param relativePoint - 局部坐标空间中的点
   * @param bufferCtx - 离屏上下文（用于命中检测）
   * @returns 第一个匹配 addon 的交互结果
   */
  protected interactPlugins(
    relativePoint: Point3,
    bufferCtx?: IDrawingContext,
  ): IInteractResult {
    if (!this.actived) return { view: null, content: null, extraData: null };

    const interactAddons = this.activeAddons
      .filter((a) => a.capabilities.includes(AddonCapability.INTERACT))
      .sort((a, b) => a.priority - b.priority);

    for (const addon of interactAddons) {
      const extraData = addon.interact(relativePoint, bufferCtx);
      if (extraData) {
        return { view: this, content: addon as any, extraData };
      }
    }
    return { view: null, content: null, extraData: null };
  }

  /**
   * 执行 addon 渲染管线
   *
   * 仅在视图处于 `actived` 状态时渲染。
   * 按优先级遍历具有 `RENDER` 能力的 addon。
   * BoxDecorationAddon（priority=-10）先渲染滚动条，
   * BoundingBoxAddon（priority=0）后渲染选中手柄。
   *
   * @param ctx - Canvas 2D 渲染上下文
   */
  protected renderPlugins(ctx: IDrawingContext): void {
    if (!this.actived) return;

    const renderAddons = this.activeAddons
      .filter((a) => a.capabilities.includes(AddonCapability.RENDER))
      .sort((a, b) => a.priority - b.priority);

    for (const addon of renderAddons) {
      addon.render(ctx);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // 交互
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * 统一交互入口
   *
   * 优先级：1. Addon（BoundingBox + 子类 addon）→ 2. 内容 → 3. 子节点
   *
   * Addon 在原始坐标空间中检测（不受滚动偏移影响）。
   * 内容和子节点在补偿滚动偏移后检测。
   *
   * @param worldPoint - 世界坐标空间中的点
   * @param bufferCtx - 离屏上下文（必需，用于命中检测）
   * @returns 交互结果，指示命中了什么
   * @throws 若未提供 `bufferCtx` 则抛出错误
   */
  public interact(
    worldPoint: Point3,
    bufferCtx?: IDrawingContext,
  ): IInteractResult {
    const relativePoint = this.getMVPMatrix().inverse().multiply(worldPoint);

    const ctx = bufferCtx;
    if (!ctx) throw new Error("interact failed: bufferCtx is required");

    // 1. 检测 addon（不受滚动偏移影响）
    const pluginsResult = this.interactPlugins(relativePoint, ctx);
    if (pluginsResult.view) return pluginsResult;

    // 2. 补偿滚动偏移（用于内容和子节点检测）
    const scrollOffset = this.decoration?.computedStyle.scrollOffset ?? {
      x: 0,
      y: 0,
    };
    const scrolledPoint = new Point3(
      relativePoint.x - scrollOffset.x,
      relativePoint.y - scrollOffset.y,
      relativePoint.z,
    );

    // 3. 检测内容
    const contentResult = this.interactContent(scrolledPoint, ctx);
    if (contentResult.view) return contentResult;

    // 4. 检测子节点（ContainerView 子类 override interactChildren）
    return this.interactChildren(scrolledPoint, ctx);
  }

  /**
   * 检测给定坐标是否命中内容。子类可 override 实现自定义逻辑。
   *
   * @param point - 局部坐标空间中的点
   * @param bufferCtx - 离屏上下文（用于命中检测）
   * @returns 交互结果，指示命中的视图和内容
   */
  protected interactContent(
    point: Point3,
    bufferCtx?: IDrawingContext,
  ): IInteractResult {
    if (!this.content) return { view: null, content: null, extraData: null };
    const hitContent =
      this.content.isPointInPath(point, bufferCtx) ||
      this.content.isPointOnCurve(point, 5);
    if (hitContent) {
      return {
        view: this,
        content: this.content,
        extraData: { cursorStyle: Cursor.Move, action: Action.MOVE },
      };
    }
    return { view: null, content: null, extraData: null };
  }

  /**
   * 子节点命中检测（叶子 View 无子节点，始终返回未命中）。
   *
   * ContainerView 子类 override 此方法以实现递归子节点命中检测。
   *
   * @param scrolledPoint - 滚动偏移补偿后的点
   * @param bufferCtx - 离屏上下文（用于命中检测）
   * @returns 子视图的交互结果
   */
  protected interactChildren(
    _scrolledPoint: Point3,
    _bufferCtx: IDrawingContext,
  ): IInteractResult {
    return { view: null, content: null, extraData: null };
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // 生命周期
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * 当视图挂载到场景树时调用
   *
   * 触发 `onCreated`（仅一次）和 `onAttach` 生命周期流程。
   * 子节点递归由 ContainerView 子类 override 处理。
   */
  public onAttach(): void {
    if (this.lifetimes.onCreated) {
      this.getScene()?.triggerSchema(this, this.lifetimes.onCreated);
      this.lifetimes.onCreated = null;
    }
    this.getScene()?.triggerSchema(this, this.lifetimes.onAttach);
  }

  /**
   * 当视图被销毁/从场景树移除时调用
   *
   * 触发 `onDestroy` 生命周期流程，然后清理引用。
   * 子节点清理由 ContainerView 子类 override 处理。
   */
  public onDestroy(): void {
    this.getScene()?.triggerSchema(this, this.lifetimes.onDestroy);
    this.parent = null;
    this.content = null;
    this.boundingBox = null;
  }

  /**
   * 销毁当前视图（公开 API）
   *
   * 调用 `onDestroy()` 触发生命周期清理。
   */
  public destroy(): void {
    this.onDestroy();
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // 渲染
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * 主渲染入口
   *
   * 将视图渲染到离屏缓冲区，然后合成到主画布。
   * 若 `visible` 为 `false` 则跳过渲染。
   *
   * @param canvasContext - 引擎的 canvas 上下文（必需）
   * @throws 若未提供 `canvasContext` 则抛出错误
   */
  public render(surface?: IDrawingSurface): void {
    if (!this.visible) return;
    if (!surface)
      throw new Error("render failed: surface is required");
    this.renderToOffScreen(surface);
    this.renderFromCache(surface);
  }

  /**
   * 将视图内容渲染到离屏缓冲区
   *
   * 渲染管线：
   * 1. 若布局脏标记则先执行延迟布局
   * 2. 渲染装饰背景（裁剪前，作为底层）
   * 3. 应用裁剪区域（overflow != visible）
   * 4. 应用滚动偏移，渲染内容 + 子节点
   * 5. 渲染 addon 插件（裁剪之上，始终在最顶层）
   */
  private renderToOffScreen(surface: IDrawingSurface): void {
    const offscreenCtx = surface.offscreen;

    // 延迟布局：若布局脏则执行完整管线（含样式解析）
    if (this._layoutDirty) {
      this.layout(offscreenCtx);
    } else if (this._styleDirty) {
      // 仅视觉样式变更（repaint），无需重新布局
      this.resolveVisualStyle();
    }

    const viewport = this.renderViewport;
    if (!viewport) return;

    const transform = this.getMVPMatrix().transform;
    // 将 dpr 融入变换矩阵，将逻辑坐标映射到物理像素
    const dpr = surface.dpr;
    const a = transform[0] * dpr;
    const b = transform[4] * dpr;
    const c = transform[1] * dpr;
    const d = transform[5] * dpr;
    const e = transform[3] * dpr;
    const f = transform[7] * dpr;

    // 阶段0：渲染装饰背景（裁剪前，作为底层）
    if (this.decoration?.hasDecoration()) {
      offscreenCtx.save();
      offscreenCtx.setTransform(a, b, c, d, e, f);
      this.decoration.renderBackground(offscreenCtx, viewport);
      offscreenCtx.restore();
    }

    // 阶段1：渲染内容和子节点（受裁剪约束）
    offscreenCtx.save();
    offscreenCtx.setTransform(a, b, c, d, e, f);

    const computedOverflow =
      this.decoration?.computedStyle.overflow ?? "visible";
    if (computedOverflow !== "visible") {
      if (this.decoration?.computedStyle.clipContent) {
        this.decoration.buildClipPath(offscreenCtx, viewport);
      } else {
        offscreenCtx.beginPath();
        offscreenCtx.rect(
          viewport.x,
          viewport.y,
          viewport.width,
          viewport.height,
        );
        offscreenCtx.clip();
      }
    }

    // 应用滚动偏移后渲染内容和子节点
    const scrollOffset = this.decoration?.computedStyle.scrollOffset ?? {
      x: 0,
      y: 0,
    };
    offscreenCtx.save();
    offscreenCtx.translate(scrollOffset.x, scrollOffset.y);

    this.renderContent(offscreenCtx);
    this.renderChildren(surface, offscreenCtx);

    offscreenCtx.restore(); // 恢复滚动平移
    offscreenCtx.restore(); // 恢复 MVP + 裁剪

    // 阶段2：渲染 addon 插件（不受裁剪约束，始终在最顶层）
    offscreenCtx.save();
    offscreenCtx.setTransform(a, b, c, d, e, f);
    this.renderPlugins(offscreenCtx);
    offscreenCtx.restore();

    // 阶段3（调试）：用不同颜色线框渲染 viewport / layoutArea / constraintBounds
    // 仅用于开发调试，可视化布局几何关系：
    //   - viewport（红色实线）：视图自身的矩形区域
    //   - layoutArea（绿色虚线）：实际内容布局区域（overflow 时可能超出 viewport）
    //   - constraintBounds（蓝色点线）：父容器传下的布局约束
    if (View.DEBUG_LAYOUT_BOUNDS) { // 由 localStorage['banvasgl:debug:layoutBounds'] 控制
      offscreenCtx.save();
      offscreenCtx.setTransform(a, b, c, d, e, f);
      // 变换已乘 dpr，逻辑坐标下的线宽需除回 dpr 以保持约 1 物理像素
      const baseLineWidth = 1 / dpr;

      const strokeBounds = (
        bounds: Bounds,
        color: string,
        dash: number[],
      ): void => {
        if (!bounds) return;
        offscreenCtx.beginPath();
        offscreenCtx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
        offscreenCtx.lineWidth = baseLineWidth;
        offscreenCtx.strokeStyle = color;
        offscreenCtx.setLineDash(dash.map((d) => d / dpr));
        offscreenCtx.stroke();
      };

      // constraintBounds 先画（最底层），viewport 最后画（最顶层）
      strokeBounds(this.constraintBounds, "#2979ff", [2, 2]); // 蓝色点线
      strokeBounds(this.layoutArea, "#00c853", [6, 4]); // 绿色虚线
      strokeBounds(viewport, "#ff1744", []); // 红色实线

      offscreenCtx.setLineDash([]);
      offscreenCtx.restore();
    }
  }

  /**
   * 将离屏缓冲区合成到主画布
   *
   * 委托给 ICanvasHost.composite()，由各平台自行实现合成策略。
   */
  private renderFromCache(surface: IDrawingSurface): void {
    surface.present();
  }

  /**
   * 将视图的内容图形渲染到给定上下文
   *
   * 获取内容图形类型的默认样式，
   * 与装饰的计算样式覆盖（fill/stroke/shadow）合并，
   * 然后调用 `content.render()`。
   *
   * @param ctx - Canvas 2D 渲染上下文
   */
  public renderContent(ctx: IDrawingContext): void {
    if (!this.content) return;
    const defaultStyle = getDefaultStyle(this.content.type);
    const computedStyle = this.decoration?.computedStyle;
    const mergedStyle = computedStyle
      ? defaultStyle.withOverrides({
          fill: computedStyle.fill,
          stroke: computedStyle.stroke,
          shadow: computedStyle.shadow,
        })
      : defaultStyle;
    this.content.render(ctx, mergedStyle);
  }

  /**
   * 渲染子节点（叶子 View 无子节点，默认空操作）。
   *
   * ContainerView 子类 override 此方法以渲染子节点列表。
   *
   * @param canvasContext - 引擎 canvas 上下文
   * @param offscreenCtx - 离屏渲染上下文
   */
  protected renderChildren(
    _surface: IDrawingSurface,
    _offscreenCtx: IDrawingContext,
  ): void {
    // 叶子 View 无子节点
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // 变换
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * 获取世界矩阵（考虑父 View 矩阵链）
   *
   * 若存在 AnimationAddon 提供的动画矩阵则优先使用。
   *
   * @param parent - 可选的遍历终止点（不含该节点）
   * @returns 累积的世界变换矩阵
   */
  public getWorldMatrix(parent?: View): Matrix4 {
    const localMatrix =
      this.animation?.resolveAnimatedMatrix() ?? this.matrix;
    if (this.parent && this.parent instanceof View && this.parent !== parent) {
      return this.parent.getWorldMatrix().copy().multiply(localMatrix);
    } else {
      return localMatrix.copy();
    }
  }

  /**
   * 获取 MVP 矩阵（VP * World）
   *
   * @returns 用于渲染和交互的组合 MVP 矩阵
   */
  public getMVPMatrix() {
    return this._vpMatrix.copy().multiply(this.getWorldMatrix());
  }

  /**
   * 设置 VP（View-Projection）矩阵
   *
   * 由 Scene 在每帧渲染前调用。子节点广播
   * 由 ContainerView 子类 override 处理。
   *
   * @param vpMatrix - 来自相机的 VP 矩阵
   */
  public setVPMatrix(vpMatrix: Matrix4): void {
    this._vpMatrix = vpMatrix;
  }

  /**
   * 沿 (x, y, z) 平移视图
   *
   * @param x - X 轴平移量
   * @param y - Y 轴平移量
   * @param z - Z 轴平移量（默认: 0）
   * @returns 当前视图（链式调用）
   */
  public translate(x: number, y: number, z: number = 0): View {
    this.matrix.translate(x, y, z);
    return this;
  }

  /**
   * 围绕原点缩放视图
   *
   * @param x - X 轴缩放因子
   * @param y - Y 轴缩放因子
   * @param z - Z 轴缩放因子（默认: 1）
   * @param origin - 局部空间中的缩放原点（默认: (0,0,0)）
   * @returns 当前视图（链式调用）
   */
  public scale(
    x: number,
    y: number,
    z: number = 1,
    origin: Point3 = new Point3(0, 0, 0),
  ): View {
    const _o = this.matrix.multiply(origin);
    this.matrix.translate(-_o.x, -_o.y, -_o.z);
    this.matrix.scale(x, y, z);
    this.matrix.translate(_o.x, _o.y, _o.z);
    return this;
  }

  /**
   * 围绕原点旋转视图
   *
   * @param x - 绕 X 轴旋转（弧度）
   * @param y - 绕 Y 轴旋转（弧度）
   * @param z - 绕 Z 轴旋转（弧度）
   * @param origin - 局部空间中的旋转原点（默认: (0,0,0)）
   * @returns 当前视图（链式调用）
   */
  public rotate(
    x: number,
    y: number,
    z: number,
    origin: Point3 = new Point3(0, 0, 0),
  ): View {
    const _o = this.matrix.multiply(origin);
    this.matrix.translate(-_o.x, -_o.y, -_o.z);
    this.matrix.rotate(x, y, z);
    this.matrix.translate(_o.x, _o.y, _o.z);
    return this;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // 状态管理
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * 设置可见性状态
   *
   * @param visible - 视图是否可见
   * @returns 当前视图（链式调用）
   */
  public setVisible(visible: boolean): View {
    this.visible = visible;
    return this;
  }

  /**
   * 设置选中状态
   *
   * @param selected - 视图是否被选中
   * @returns 当前视图（链式调用）
   */
  public setSelected(selected: boolean): View {
    this.selected = selected;
    return this;
  }

  /**
   * 设置激活（聚焦）状态
   *
   * @param actived - 视图是否激活
   * @returns 当前视图（链式调用）
   */
  public setActived(actived: boolean): View {
    this.actived = actived;
    return this;
  }

  /**
   * 设置冻结（锁定）状态
   *
   * @param freezed - 视图是否冻结
   * @returns 当前视图（链式调用）
   */
  public setFreezed(freezed: boolean): View {
    this.freezed = freezed;
    return this;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // 布局
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * 执行内容布局并返回结果边界
   *
   * 以当前 `constraintBounds` 作为布局约束调用 `content.layout()`。
   * 主要用于需要测量的文本内容。
   *
   * @param ctx - 可选的 canvas 上下文（用于文本测量）
   * @returns 内容的布局边界
   */
  public layoutContent(ctx?: IDrawingContext): Bounds {
    return (
      this.content?.layout(this.constraintBounds, ctx)?.bounds ??
      this.content?.bounds ??
      Bounds.empty()
    );
  }

  /**
   * 执行实际布局：布局内容并设置 layoutArea。
   *
   * 叶子 View 仅布局自身内容（Graph）。
   * ContainerView 子类 override 此方法以额外布局子容器。
   *
   * @param ctx - 可选的 canvas 上下文（用于文本测量）
   */
  protected performLayout(ctx?: IDrawingContext): void {
    const contentBounds = this.layoutContent(ctx);
    this.layoutArea = Bounds.union(this.viewport, contentBounds);
  }

  /**
   * 标记布局为脏，向上冒泡到根节点。
   *
   * 子类和外部模块调用此方法触发延迟布局（reflow）。
   * 实际布局在下一帧渲染前执行。
   * 布局脏隐含样式脏（reflow 必然伴随 repaint）。
   */
  public markLayoutDirty(): void {
    if (this._layoutDirty) return;
    this._layoutDirty = true;
    this._styleDirty = true;
    if (this.parent && this.parent instanceof View) {
      this.parent.markLayoutDirty();
    }
  }

  /**
   * 标记视觉样式为脏（仅 repaint，不触发 reflow）。
   *
   * 当只有视觉属性（背景色、边框、fill/stroke/shadow 等）变更时调用。
   * 不向上冒泡——视觉变更不影响父布局。
   *
   * 注意：影响布局的属性变更（overflow、width、height、flexLayout、scrollLayout 等）
   * 必须通过 `markLayoutDirty()` 触发，否则 resolveLayoutStyle 不会重新执行。
   */
  public markStyleDirty(): void {
    if (this._styleDirty) return;
    this._styleDirty = true;
  }

  /**
   * 执行布局计算（两阶段管线）
   *
   * 管线顺序（对标浏览器 Style → Layout → Paint）：
   * 1. resolveVisualStyle()（阶段 A）：解析与几何无关的视觉样式
   * 2. 布局内容并测量子节点以计算 `layoutArea`
   * 3. 若 `needStructViewport`，则扩展 viewport 以匹配 layoutArea
   * 4. resolveLayoutStyle()（阶段 B）：解析依赖几何的布局样式
   * 5. 返回实际 viewport 供父容器"收集"阶段使用
   *
   * @param ctx - 可选的 canvas 上下文（用于文本测量）
   * @returns 视图的实际 viewport 边界
   */
  public layout(ctx?: IDrawingContext): Bounds {
    this._layoutDirty = false;

    // 1. 阶段 A：解析视觉样式（布局前，不依赖几何）
    this.resolveVisualStyle();

    // 2. 执行实际布局（多态：叶子仅布局内容，容器额外布局子节点）
    this.performLayout(ctx);

    // 3. 为结构视图扩展 viewport
    if (this.style.needStructViewport) {
      this.viewport = this.layoutArea.copy();
      this.boundingBox?.updateViewport(this.viewport);
    }

    // 4. 阶段 B：解析布局样式（布局后，依赖几何）
    this.resolveLayoutStyle();

    // 5. 返回 viewport 供父布局使用
    return this.viewport;
  }

  /**
   * 阶段 A：解析与布局无关的视觉样式（repaint 级别）
   *
   * 计算容器装饰域（背景/边框/圆角/opacity）+ 图形绘制域（fill/stroke/shadow）。
   * 仅依赖 rawStyle 声明值，不需要 viewport/layoutArea 几何信息。
   * 在 layout() 管线开头调用，也可独立调用（仅 repaint 场景）。
   */
  protected resolveVisualStyle(): void {
    this._styleDirty = false;

    // 确保 BoxDecorationAddon 始终存在，以便 resolveVisual 处理
    // backgroundColor / borderWidth / borderColor / borderRadius / clipContent / opacity
    // hasDecoration() 在渲染路径上已是零成本守卫
    if (!this.decoration) {
      this.decoration = new BoxDecorationAddon();
    }

    this.decoration.resolveVisual(this.style);
  }

  /**
   * 阶段 B：解析依赖布局结果的样式（reflow 级别）
   *
   * 计算 overflow、scrollOffset、滚动条几何。
   * 需要布局后的 viewport 和 layoutArea 几何信息。
   * 在 layout() 管线末尾调用（布局内容之后）。
   */
  protected resolveLayoutStyle(): void {
    if (this.decoration) {
      this.decoration.resolveLayout(this.style, this.viewport, this.layoutArea);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // 尺寸调整与编辑
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * 通过拖拽包围盒手柄调整视图尺寸
   *
   * 根据拖拽向量相对于固定点/动态点的参考计算尺寸增量，
   * 更新 viewport 位置和大小，并可选地等比例调整内容大小。
   *
   * @param fixedPoint - 调整时保持不动的锚点
   * @param dynamicPoint - 被拖拽的手柄点
   * @param vector - 世界坐标中的拖拽位移向量
   * @param needResizeContent - 是否同时调整内容图形大小
   */
  public resize(
    fixedPoint: Point3,
    dynamicPoint: Point3,
    vector: Vector3,
    needResizeContent?: boolean,
  ) {
    const mvp = this.getMVPMatrix();
    const inverseMvp = mvp.inverse();
    const relativeVector = inverseMvp.multiply(vector);
    const handles = this.boundingBox?.handles;
    const viewport = this.viewport;
    if (!handles) throw new Error("BoundingBox addon missing");
    if (!viewport) throw new Error("Viewport missing");

    const referenceVector = dynamicPoint.subtract(fixedPoint);

    const deltaX = calculateDimensionDelta(
      viewport.width,
      referenceVector.x,
      relativeVector.x,
    );
    const deltaY = calculateDimensionDelta(
      viewport.height,
      referenceVector.y,
      relativeVector.y,
    );

    // 通过匹配 dynamicPoint 定位正在拖拽的手柄
    const dynamicIndex = handles.findIndex((h) =>
      h.getCenter().isSame(dynamicPoint),
    );
    if (dynamicIndex !== -1) {
      const canResize = RESIZE_SIZE_MAP[dynamicIndex];
      const newWidth = viewport.width + Number(canResize.width) * deltaX;
      const newHeight = viewport.height + Number(canResize.height) * deltaY;

      // 若结果为零则跳过（避免下游计算除以零）
      if (newWidth === 0 || newHeight === 0) return;

      // 对左上手柄移动 viewport 原点
      const canMoveOrigin = RESIZE_ORIGIN_MAP[dynamicIndex];
      this.viewport.setPosition(
        viewport.x + (canMoveOrigin.x ? -deltaX : 0),
        viewport.y + (canMoveOrigin.y ? -deltaY : 0),
      );

      this.viewport?.setSize(newWidth, newHeight);
      this.boundingBox?.updateSize();
    }

    // 子节点递归调整由 ContainerView 子类 override 处理

    if (needResizeContent && this.content) {
      this.content.resize(fixedPoint, fixedPoint, relativeVector);
      this.constraintBounds = this.content.bounds?.copy() ?? Bounds.empty();
      this.markLayoutDirty();
    }
  }

  /**
   * 编辑顶点（子类 override 实现具体逻辑）
   *
   * @param point - 当前鼠标位置（屏幕坐标）
   * @param delta - 位移向量（屏幕坐标）
   */
  public editPoint(_point: Point3, _delta: Vector3): void {
    // 默认空操作；GraphView 等子类 override
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // 序列化
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * 将 View 实例序列化为纯数据对象
   *
   * 无额外持久化字段的子类可直接继承。
   *
   * @returns 可 JSON 序列化的纯对象，代表当前视图
   */
  public toJSON(): any {
    return {
      id: this.id,
      type: this.type,
      visible: this.visible,
      freezed: this.freezed,
      data: this.data,
      events: this.events,
      lifetimes: this.lifetimes,
      style: this.style,
      matrix: this.matrix.toJSON(),
      viewport: this.viewport.toJSON(),
      constraintBounds: this.constraintBounds.toJSON(),
      decoration: this.decoration ? this.decoration.toJSON() : undefined,
      content: this.content
        ? {
            $type: (this.content as any).type,
            $value: (this.content as any).toJSON(),
          }
        : null,
    };
  }

  /**
   * 从纯数据对象恢复公共字段（反序列化辅助方法）
   *
   * 由子类 `fromJSON` 在构造实例后调用。
   * 执行纯字段赋值，不触发 layout dirty。
   * 子类应在此方法返回后调用 `markLayoutDirty()`。
   *
   * @param data - 来自 `toJSON()` 的纯数据对象
   */
  protected restoreCommonFields(data: any): void {
    this.id = data.id;
    this.visible = data.visible;
    this.freezed = data.freezed;
    if (data.data) this.data = data.data;
    if (data.events) Object.assign(this.events, data.events);
    if (data.lifetimes) Object.assign(this.lifetimes, data.lifetimes);
    if (data.style) this.style = data.style;
    if (data.matrix) this.matrix = Matrix4.fromJSON(data.matrix);
    if (data.viewport) this.viewport = Bounds.fromJSON(data.viewport);
    if (data.constraintBounds)
      this.constraintBounds = Bounds.fromJSON(data.constraintBounds);

    // 恢复装饰
    if (data.decoration) {
      this.decoration = BoxDecorationAddon.fromJSON(data.decoration);
    }

    // 重建 boundingBox（绑定到新的 viewport 引用）
    this.boundingBox?.updateViewport(this.viewport);

    // 同步 layoutArea
    this.layoutArea = this.viewport.copy();

    // constraintBounds 回退
    if (!this.constraintBounds || this.constraintBounds.isEmpty) {
      this.constraintBounds = this.viewport.copy();
    }

    // 子节点恢复由 ContainerView 子类 override 处理
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // 吸附（编辑器工具）
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * 获取吸附对象（点和线），用于编辑器中的对齐参考线
   *
   * 返回包围盒手柄中心作为吸附点，包围盒边缘作为吸附线。
   *
   * @returns [吸附点, 吸附线] 元组
   */
  public getSnapObjects(): [Point3[], Line[]] {
    if (!this.boundingBox) return [[], []];
    const mvpInverse = this.getMVPMatrix().inverse();
    const points = this.boundingBox.handles.map((handler) =>
      mvpInverse.multiply(handler.getCenter()),
    );
    const lines = this.boundingBox.region.transform(mvpInverse)
      .graphs as Line[];
    return [points, lines];
  }
}
