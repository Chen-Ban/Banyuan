import { ViewType } from "@/foundation/constants";
import Matrix4 from "@/foundation/math/Matrix4";
import CanvasContext from "@/engine/CanvasContext";
import {
  Action,
  AddonCapability,
  Cursor,
  ISceneNode,
  IView,
  IViewStyle,
  IFieldSchemaMap,
  ISerializable,
  IGraph,
} from "@/types";
import type {
  IAddonBase,
  IViewEvents,
  IViewLifetimes,
  IFlexLayoutParams,
  IInteractResult,
  IViewOptions,
} from "@/types";

// 导入图形相关类型
import { Line } from "@/graph";
import { Rectangle } from "@/graph/combined/Polygon";
import { getDefaultStyle } from "@/graph/DefaultStyleRegistry";

// 导入addon类型
import { BoundingBoxAddon, BoxDecorationAddon } from "@/view/addon";
import { MathUtils, Point3, Vector3 } from "@/foundation/math";
import Bounds from "@/graph/base/Bounds";
import type { AnimatableValue } from "@/types";
import Scene from "@/engine/Scene";
import AnimationAddon from "@/view/addon/AnimationAddon";
import {
  RESIZE_SIZE_MAP,
  RESIZE_ORIGIN_MAP,
  createDefaultEvents,
  createDefaultLifetimes,
  createDefaultViewStyle,
} from "./constant.js";
import { calculateDimensionDelta } from "./utils.js";

export default abstract class View<D extends IFieldSchemaMap = IFieldSchemaMap>
  implements IView, ISerializable
{
  // 基本属性
  public id: string = "";
  public name: string = "";
  public data: D = {} as D;
  public content: IGraph | null;
  /** 类级空数组常量，避免每次 getter 调用创建新引用 */
  private static readonly EMPTY_CHILDREN: View[] = [];

  /**
   * 子视图列表。
   * 基类默认返回空数组（叶子 View 无子节点）。
   * ContainerView 子类 override 此 getter 返回实际 children。
   */
  get children(): View[] {
    return View.EMPTY_CHILDREN;
  }
  public parent: ISceneNode | View | null = null;

  // 事件与生命周期
  public events: IViewEvents = createDefaultEvents();
  public lifetimes: IViewLifetimes = createDefaultLifetimes();

  // 样式和状态
  public style: IViewStyle = {};

  public selected: boolean = false;
  public actived: boolean = false;
  public freezed: boolean = false;
  public visible: boolean = true;
  // 变换矩阵
  public matrix: Matrix4 = Matrix4.identity();
  // VP 矩阵缓存（由 Scene 在每帧渲染前广播设置）
  private _vpMatrix: Matrix4 = Matrix4.identity();
  // 插件
  public boundingBox: BoundingBoxAddon | null = null;
  /** 纯视觉装饰插件（背景/边框/圆角），不参与交互检测 */
  public decoration: BoxDecorationAddon | null = null;
  /** 纯视觉动画插件（关键帧动画驱动），不参与交互检测 */
  public animation: AnimationAddon | null = null;
  /** 布局参数（作为子元素参与父容器的 Flex 布局时生效） */
  public layoutParams?: IFlexLayoutParams;
  // 视口
  public viewport: Bounds;
  /** 渲染时使用的视口：动画覆盖层优先，否则取真实 viewport */
  get renderViewport(): Bounds {
    return this.animation?.animatedViewport ?? this.viewport;
  }
  // 内容布局区域
  public layoutArea: Bounds;
  /** 布局脏标记：为 true 时下次渲染前需要重新执行 layout */
  protected _layoutDirty: boolean = true;
  // 排版约束区域：容器对内容的布局约束（描述内容可排版的空间）
  public constraintBounds: Bounds = Bounds.empty();
  // 类型
  public abstract readonly type: ViewType;
  //抽象方法
  public abstract copy(): View;

  // ==================== 动画系统（通过 AnimationAddon 提供） ====================

  /**
   * 获取渲染时应使用的属性值（动画计算值优先）
   * 代理到 AnimationAddon，无 addon 时返回 undefined
   */
  public getAnimatedValue(prop: string): AnimatableValue | undefined {
    return this.animation?.getAnimatedValue(prop);
  }

  // 获取内容
  public layoutContent(ctx?: CanvasRenderingContext2D): Bounds {
    // 内容布局区域，优先调用布局方法(主要只有文字需要进行内容布局)，然后看已有bounds
    // constraintBounds 由 View 持有并传递给 content.layout() 作为排版约束
    return (
      this.content?.layout(this.constraintBounds, ctx)?.bounds ??
      this.content?.bounds ??
      Bounds.empty()
    );
  }

  // 计算子容器布局区域和
  public measureChildren(): Bounds {
    // 将子视口转换为矩形
    const childRects = this.children.map((child) => {
      return Rectangle.fromBounds(child.viewport);
    });
    // 应用各自的变换矩阵
    childRects.forEach((rect, i) => rect.transform(this.children[i].matrix));
    // 计算所有子容器在本地坐标系下的总包围盒
    return Bounds.fromPoints(
      childRects.map((rect) => rect.controlPoints).flat(),
    );
  }

  public renderContent(ctx: CanvasRenderingContext2D): void {
    if (!this.content) return;
    // 从 DefaultStyleRegistry 获取该图形类型的默认样式
    const defaultStyle = getDefaultStyle(this.content.type);
    // 用 computedStyle 中非 null 的 fill/stroke/shadow 覆盖默认样式
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
   * 检查内容是否被命中，子类可以重写此方法实现自定义逻辑
   * @param point 相对坐标点
   * @param bufferCtx 用于命中检测的离屏上下文
   */
  protected interactContent(
    point: Point3,
    bufferCtx?: CanvasRenderingContext2D,
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

  // ==================== Addon 管线 ====================

  /**
   * 获取当前 View 实例上所有活跃的 addon 列表。
   *
   * 子类通过 override 此 getter 追加自己的 addon（如 GraphView 追加 VertexAddon）。
   * 管线（renderPlugins / interactPlugins）统一遍历此列表，
   * 根据 addon.capabilities 决定是否调用 render/interact，
   * 按 addon.priority 排序执行（数值越小越先执行）。
   *
   * @example
   * ```ts
   * // GraphView 中追加 VertexAddon
   * protected override get activeAddons(): IAddonBase[] {
   *   return [...super.activeAddons, this.controlPoints].filter(Boolean)
   * }
   * ```
   */
  protected get activeAddons(): IAddonBase[] {
    const addons: IAddonBase[] = [];
    if (this.decoration) addons.push(this.decoration);
    if (this.boundingBox) addons.push(this.boundingBox);
    return addons;
  }

  protected interactPlugins(
    relativePoint: Point3,
    bufferCtx?: CanvasRenderingContext2D,
  ): IInteractResult {
    if (!this.actived) return { view: null, content: null, extraData: null };

    // 按 priority 排序，遍历具有 INTERACT 能力的 addon
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
   * 统一交互方法
   * 优先级：1. 插件 -> 2. 内容 -> 3. 子视图
   * @param worldPoint 世界坐标点
   */
  public interact(
    worldPoint: Point3,
    bufferCtx?: CanvasRenderingContext2D,
  ): IInteractResult {
    const relativePoint = this.getMVPMatrix().inverse().multiply(worldPoint);

    const ctx = bufferCtx;
    if (!ctx) throw new Error("交互失败：需要传入 bufferCtx");

    // 1. 检查插件（BoundingBox + 子类插件）—— 插件不随 scroll 移动，用原始坐标
    const pluginsResult = this.interactPlugins(relativePoint, ctx);
    if (pluginsResult.view) return pluginsResult;

    // 2. 补偿 scroll 偏移：内容和子视图在渲染时被 translate 了 scrollOffset，
    //    命中检测时需要反向补偿，将点转换到"内容坐标系"
    const scrollOffset = this.decoration?.computedStyle.scrollOffset ?? {
      x: 0,
      y: 0,
    };
    const scrolledPoint = new Point3(
      relativePoint.x - scrollOffset.x,
      relativePoint.y - scrollOffset.y,
      relativePoint.z,
    );

    // 3. 检查内容（复杂图形由子类重写）
    const contentResult = this.interactContent(scrolledPoint, ctx);
    if (contentResult.view) return contentResult;

    // 4. 递归检查子视图，数组靠后的 View 绘制在上方，优先命中
    //    将 scrolledPoint 转回世界坐标传给子视图，子视图再用自己的 MVP 逆矩阵转本地坐标
    const adjustedWorldPoint = this.getMVPMatrix().multiply(scrolledPoint);
    let best: IInteractResult = { view: null, content: null, extraData: null };
    for (const child of this.children) {
      const childResult = child.interact(adjustedWorldPoint, ctx);
      if (childResult.view && childResult.content && childResult.extraData) {
        // 数组中靠后的 child 绘制在上方，后遍历的胜出
        best = childResult;
      }
    }

    return best;
  }

  constructor(options: IViewOptions<D>) {
    // 属性初始化
    this.id = options.id || "";
    this.data = options.data || ({} as D);
    // 二层合并：createDefaultViewStyle() → 用户传入 options.style
    // 靠右优先级更高，用户传入值始终不被覆盖
    this.style = {
      ...createDefaultViewStyle(),
      ...(options.style || {}),
    };
    this.matrix = options.matrix ?? Matrix4.identity();
    this.content = options.content ?? null;
    this.parent = options.parent ?? null;

    // 生命周期与事件绑定
    if (options.lifetimes) {
      Object.assign(this.lifetimes, options.lifetimes);
    }
    if (options.events) {
      Object.assign(this.events, options.events);
    }

    // 开始布局相关
    // 步骤1: 初始化视口
    this.viewport = new Bounds(
      0,
      0,
      options.style?.width || 0,
      options.style?.height || 0,
    );
    this.boundingBox = new BoundingBoxAddon(this.viewport);

    // 步骤1.5: 初始化装饰插件
    if (options.decoration) {
      this.decoration = new BoxDecorationAddon(options.decoration);
    }

    // 步骤1.6: 初始化布局参数
    if (options.layoutParams) {
      this.layoutParams = options.layoutParams;
    }

    // 步骤2: 初始化布局区域(使用视口大小作为初始值)
    this.layoutArea = this.viewport.copy();

    // 步骤3: 初始化排版约束区域（容器对内容的布局约束）
    this.constraintBounds = this.viewport.copy();

    // 步骤4: 布局延迟到首次渲染时执行（_layoutDirty 初始为 true）

    // onCreated 已移至 onAttach() 中触发（挂载到 Scene 后执行）
  }

  /**
   * 向上遍历父节点，返回当前 View 所属的 Scene。
   *
   * 若 View 尚未挂载到任何 Scene（如在构造期调用），返回 null。
   */
  public getScene(): Scene | null {
    let node: unknown = this.parent;
    while (node && !("camera" in (node as object))) {
      node = (node as { parent?: unknown }).parent;
    }
    return (node as Scene | null) ?? null;
  }

  /**
   * 设置运行时字段值
   *
   * 只写入各字段的 value，不修改 default 和 type。
   * key 不存在于 data 中时静默忽略。
   */
  public setData(
    values: Record<string, string | number | boolean | object>,
  ): void {
    // 通过基类型 IFieldSchemaMap 操作，绕过泛型 D 的写入限制
    const data = this.data as IFieldSchemaMap;
    for (const key of Object.keys(values)) {
      if (key in data) {
        data[key] = { ...data[key], value: values[key] };
      }
    }
  }

  // 生命周期方法（引擎内部调用，附带触发用户自定义 lifetimes）

  public onAttach(): void {
    // 前序遍历：先触发自身生命周期，再递归子节点
    // onCreated 在首次挂载时触发（仅一次），onAttach 每次挂载都触发
    if (this.lifetimes.onCreated) {
      this.getScene()?.triggerSchema(this, this.lifetimes.onCreated);
      // 清除引用，确保只触发一次（null 是 FlowSchema | null 的合法值）
      this.lifetimes.onCreated = null;
    }
    this.getScene()?.triggerSchema(this, this.lifetimes.onAttach);
    this.children.forEach((child) => child.onAttach());
  }

  public onDestroy(): void {
    // 先触发生命周期（清理前 Scene 引用还在）
    this.getScene()?.triggerSchema(this, this.lifetimes.onDestroy);
    // 清理引用（children 的清理由 ContainerView 子类负责）
    this.parent = null;
    this.content = null;
    this.boundingBox = null;
  }

  initRef(children: View[]) {
    children.forEach((child) => {
      child.parent = this;
    });
  }

  /**
   * 编辑顶点 — 子类可 override 实现具体逻辑
   * @param point 当前鼠标位置（屏幕坐标）
   * @param delta 位移向量（屏幕坐标）
   */
  public editPoint(_point: Point3, _delta: Vector3): void {
    // 默认不做任何事，由 GraphView 等子类 override
  }

  public resize(
    fixedPoint: Point3,
    dynamicPoint: Point3,
    vector: Vector3,
    needResizeContent?: boolean,
  ) {
    const mvp = this.getMVPMatrix();
    const inverseMvp = mvp.inverse();
    // 世界坐标系转换到本地坐标系
    const relativeVector = inverseMvp.multiply(vector);
    const handles = this.boundingBox?.handles;
    const viewport = this.viewport;
    if (!handles) throw new Error("包围盒插件丢失");
    if (!viewport) throw new Error("视口丢失");

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

    // 通过 dynamicPoint 直接定位当前拖拽的手柄索引，避免方向匹配在极端比例下误判
    const dynamicIndex = handles.findIndex((h) =>
      h.getCenter().isSame(dynamicPoint),
    );
    if (dynamicIndex !== -1) {
      const canResize = RESIZE_SIZE_MAP[dynamicIndex];
      const newWidth = viewport.width + Number(canResize.width) * deltaX;
      const newHeight = viewport.height + Number(canResize.height) * deltaY;

      // 当resize结果为0时，不进行操作，避免后续计算出错
      // 1、calculateDimensionDelta出错导致视口不变化
      // 2、graph resize在边界时比例失调
      if (newWidth === 0 || newHeight === 0) return;

      // 根据手柄位置决定是否移动视口起点
      // 拖左侧/上方手柄时，起点需要反向偏移以保持固定点不动
      const canMoveOrigin = RESIZE_ORIGIN_MAP[dynamicIndex];
      this.viewport.setPosition(
        viewport.x + (canMoveOrigin.x ? -deltaX : 0),
        viewport.y + (canMoveOrigin.y ? -deltaY : 0),
      );

      this.viewport?.setSize(newWidth, newHeight);

      // boundingBox 直接从 viewport 引用读取最新位置和尺寸
      this.boundingBox?.updateSize();
    }

    // 修改子容器。
    this.children.forEach((view) => {
      view.resize(fixedPoint, dynamicPoint, vector, needResizeContent);
    });

    if (needResizeContent && this.content) {
      this.content.resize(fixedPoint, fixedPoint, relativeVector);
      // resize 后将内容实际边界回写为新的排版约束
      this.constraintBounds = this.content.bounds?.copy() ?? Bounds.empty();
      // 标记布局脏，延迟到渲染时重算
      this.markLayoutDirty();
    }
  }

  // 渲染方法
  public render(canvasContext?: CanvasContext): void {
    if (!this.visible) {
      return;
    }
    if (!canvasContext) throw new Error("渲染失败：需要传入 CanvasContext");
    this.renderToOffScreen(canvasContext);

    // TODO：这里可以利用离屏画布内容对每个容器做监控

    this.renderFromCache(canvasContext);
  }

  private renderToOffScreen(canvasContext: CanvasContext): void {
    const offscreenCtx = canvasContext.getBufferContext();

    // 布局收口：渲染前检查脏标记，统一执行布局（传入 ctx 供文本测量使用）
    if (this._layoutDirty) {
      this.layout(offscreenCtx);
    }

    const viewport = this.renderViewport;

    if (!viewport) {
      return;
    }

    const transform = this.getMVPMatrix().transform;

    // ── 第〇阶段：渲染 decoration 背景（在 clip 之前，作为最底层） ──
    if (this.decoration?.hasDecoration()) {
      offscreenCtx.save();
      offscreenCtx.setTransform(
        transform[0],
        transform[4],
        transform[1],
        transform[5],
        transform[3],
        transform[7],
      );
      this.decoration.renderBackground(offscreenCtx, viewport);
      offscreenCtx.restore();
    }

    // ── 第一阶段：渲染内容和子节点（受 clip 约束） ──
    offscreenCtx.save();
    offscreenCtx.setTransform(
      transform[0],
      transform[4],
      transform[1],
      transform[5],
      transform[3],
      transform[7],
    );

    // computeStyle() 保证：overflow 非 visible 时 decoration 一定存在并已 compute
    const computedOverflow =
      this.decoration?.computedStyle.overflow ?? "visible";
    if (computedOverflow !== "visible") {
      // 裁剪区域：computedStyle.clipContent 时使用圆角路径，否则矩形
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

    // 应用 scroll 偏移后渲染内容和子节点（偏移量来自 decoration.computedStyle）
    const scrollOffset = this.decoration?.computedStyle.scrollOffset ?? {
      x: 0,
      y: 0,
    };
    offscreenCtx.save();
    offscreenCtx.translate(scrollOffset.x, scrollOffset.y);

    this.renderContent(offscreenCtx);
    this.children.forEach((view) => {
      if (!view.visible) return;
      view.renderToOffScreen(canvasContext);
    });

    offscreenCtx.restore(); // 恢复 scroll translate
    offscreenCtx.restore(); // 恢复 MVP + clip（clip 随 save/restore 出栈）

    // ── 第二阶段：渲染插件（不受 clip 约束，始终在内容之上） ──
    offscreenCtx.save();
    offscreenCtx.setTransform(
      transform[0],
      transform[4],
      transform[1],
      transform[5],
      transform[3],
      transform[7],
    );
    this.renderPlugins(offscreenCtx);
    offscreenCtx.restore();
  }

  // 从缓存渲染到主画布
  private renderFromCache(canvasContext: CanvasContext): void {
    const mainCtx = canvasContext.getMainContext();
    const offscreenCtx = canvasContext.getBufferContext();
    if (!offscreenCtx) return;
    const canvas = offscreenCtx.canvas as unknown as OffscreenCanvas;
    // 将离屏画布内容绘制到主画布
    /**
     * 注意
     * 需要将主画布的变换清零
     * 让缓冲区内容能够绘制到正确的地方
     */
    canvasContext.save();
    canvasContext.setTransform([1, 0, 0, 1, 0, 0]);
    mainCtx.drawImage(canvas.transferToImageBitmap(), 0, 0);
    canvasContext.restore();
  }

  /**
   * 渲染插件管线
   *
   * 统一遍历 activeAddons，按 priority 排序，
   * 仅调用具有 RENDER 能力的 addon 的 render() 方法。
   * BoxDecorationAddon(priority=-10) 最先渲染滚动条，BoundingBoxAddon(priority=0) 在其后渲染。
   */
  protected renderPlugins(ctx: CanvasRenderingContext2D): void {
    if (!this.actived) return;

    // 按 priority 排序，遍历具有 RENDER 能力的 addon
    const renderAddons = this.activeAddons
      .filter((a) => a.capabilities.includes(AddonCapability.RENDER))
      .sort((a, b) => a.priority - b.priority);

    for (const addon of renderAddons) {
      addon.render(ctx);
    }
  }

  // 获取世界矩阵（考虑父view的matrix）
  public getWorldMatrix(parent?: View): Matrix4 {
    // 优先使用动画计算的 matrix
    const localMatrix =
      (this.getAnimatedValue("matrix") as Matrix4) ?? this.matrix;
    if (this.parent && this.parent instanceof View && this.parent !== parent) {
      // 如果有父view，则世界矩阵 = 父view的世界矩阵 * 当前view的matrix
      return this.parent.getWorldMatrix().copy().multiply(localMatrix);
    } else {
      // 如果没有父view，则世界矩阵就是当前view的matrix
      return localMatrix.copy();
    }
  }

  public getMVPMatrix() {
    return this._vpMatrix.copy().multiply(this.getWorldMatrix());
  }

  /**
   * 设置 VP 矩阵并递归广播到所有子 View。
   * 由 Scene 在每帧渲染前调用，交互时直接从缓存读取。
   */
  public setVPMatrix(vpMatrix: Matrix4): void {
    this._vpMatrix = vpMatrix;
    this.children.forEach((child) => child.setVPMatrix(vpMatrix));
  }

  // 变换方法
  public translate(x: number, y: number, z: number = 0): View {
    this.matrix.translate(x, y, z);
    return this;
  }

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

  // 状态管理
  public setVisible(visible: boolean): View {
    this.visible = visible;
    return this;
  }

  public setSelected(selected: boolean): View {
    this.selected = selected;
    return this;
  }

  public setActived(actived: boolean): View {
    this.actived = actived;
    return this;
  }

  public setFreezed(freezed: boolean): View {
    this.freezed = freezed;
    return this;
  }

  /**
   * 标记布局为脏，向上冒泡到根节点。
   * 子类和外部模块通过此方法触发延迟布局。
   */
  public markLayoutDirty(): void {
    if (this._layoutDirty) return; // 已脏，无需重复冒泡
    this._layoutDirty = true;
    // 向上冒泡：父节点也需要重新布局（FlexView 等容器需要重排所有子节点）
    if (this.parent && this.parent instanceof View) {
      this.parent.markLayoutDirty();
    }
  }

  // 布局管理
  public layout(ctx?: CanvasRenderingContext2D): Bounds {
    this._layoutDirty = false;
    // 1、执行布局,获取最新的内容布局区域并更新
    const contentBounds = this.layoutContent(ctx); // 拓展方向为第一个图形的拓展方向
    this.layoutArea = Bounds.union(
      this.viewport, // 将视口加入进来，主导布局区域的拓展方向，并且保证布局区域包含视口
      contentBounds,
      this.measureChildren(),
    );
    if (this.style.needStructViewport) {
      this.viewport = this.layoutArea.copy();
      const prevCapabilities = this.boundingBox?.capabilities;
      this.boundingBox = new BoundingBoxAddon(this.viewport);
      if (prevCapabilities) this.boundingBox.capabilities = prevCapabilities;
    }
    // 2、计算样式（rawStyle -> computedStyle，包含 scrollOffset）
    this.computeStyle();
    // 3、返回实际视口（供父容器"归"阶段使用）
    return this.viewport;
  }

  /**
   * 将 rawStyle 计算为 computedStyle。
   *
   * 若 View 没有 decoration，则任何需要 computedStyle 的读取（如 scrollOffset）
   * 都会走 `decoration?.computedStyle ?? fallback` 的默认分支，无需处理。
   *
   * 若 View 有 decoration，委托 BoxDecorationAddon.compute() 完成全量计算：
   * 装饰字段 + overflow + scrollOffset 一次性更新。
   *
   * 若 View 没有 decoration 但需要 overflow=scroll 能力，
   * 需先在构造时（或此处）按需创建 BoxDecorationAddon。
   */
  protected computeStyle(): void {
    const overflow = this.style.overflow;

    if (overflow === "scroll" || overflow === "hidden") {
      // overflow 非 visible：需要 decoration 来持有 computedStyle
      if (!this.decoration) {
        this.decoration = new BoxDecorationAddon();
      }
      this.decoration.compute(this.style, this.viewport, this.layoutArea);
    } else if (this.decoration) {
      // overflow = visible（或未设置）：decoration 存在时仍然 compute（同步装饰字段）
      this.decoration.compute(this.style, this.viewport, this.layoutArea);
    }
    // overflow = visible 且无 decoration：无 scrollOffset 需求，跳过
  }

  // ==================== 序列化 ====================

  /**
   * 从纯数据对象恢复 View 公共字段（纯字段赋值，不触发布局标脏）。
   * 子类 fromJSON 中构造实例后调用此方法完成公共属性恢复，
   * 随后由子类自行调用 markLayoutDirty() 标脏。
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
    // 恢复 decoration
    if (data.decoration) {
      this.decoration = BoxDecorationAddon.fromJSON(data.decoration);
    }
    // 恢复 layoutParams
    if (data.layoutParams) {
      this.layoutParams = data.layoutParams;
    }
    // 重建 boundingBox（绑定到新的 viewport 引用）
    if (this.boundingBox !== null) {
      const prevCapabilities = this.boundingBox.capabilities;
      this.boundingBox = new BoundingBoxAddon(this.viewport);
      this.boundingBox.capabilities = prevCapabilities;
    }
    // 同步 layoutArea
    this.layoutArea = this.viewport.copy();
    // constraintBounds 兜底
    if (!this.constraintBounds || this.constraintBounds.isEmpty) {
      this.constraintBounds = this.viewport.copy();
    }
    // children 的恢复由 ContainerView 子类的 restoreCommonFields override 负责
  }

  /**
   * 将 View 实例序列化为纯数据对象。
   * 子类如无额外持久化字段，可直接继承此方法。
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
      layoutParams: this.layoutParams ?? undefined,
      content: this.content
        ? {
            $type: (this.content as any).type,
            $value: (this.content as any).toJSON(),
          }
        : null,
      children: this.children.map((child) => ({
        $type: child.type,
        $value: child.toJSON(),
      })),
    };
  }

  // 不需要递归获取子视图的吸附数据
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

  // 销毁视图
  public destroy(): void {
    this.onDestroy();
  }
}
