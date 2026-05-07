import { VIEWTYPE } from "@/core/constants";
import Matrix4 from "@/core/math/Matrix4";
import { getGlobalCanvasContext } from "@/core/renderer/CanvasContext";
import {
  Action,
  Cursor,
  ISceneNode,
  IView,
  IViewStyle,
  IViewAddon,
  ExtraData,
  ISerializable,
  IGraph,
} from "@/core/interfaces";

// 导入图形相关类型
import { Line, Rectangle } from "@/core/graph";

// 导入addon类型
import { BoundingBoxAddon } from "@/core/views/addon";
import { MathUtils, Point3, Vector3 } from "@/core/math";
import Bounds from "@/core/graph/base/Bounds";
import Animation from "@/core/animation/Animation";
import type {
  AnimationOptions,
  KeyframeDefinition,
  AnimatableValue,
} from "@/core/animation/types";

const RESIZE_SIZE_MAP = [
  { width: true, height: true },
  { width: false, height: true },
  { width: true, height: true },
  { width: true, height: false },

  { width: true, height: true },
  { width: false, height: true },
  { width: true, height: true },
  { width: true, height: false },
];

// 控制 resize 时是否需要移动视口起点
// 当拖拽手柄在固定点的左侧时需要移动 x，在上方时需要移动 y
const RESIZE_ORIGIN_MAP = [
  { x: true, y: true }, // 0: 左上角 → 起点x和y都要反向偏移
  { x: false, y: true }, // 1: 上中 → 只偏移y
  { x: false, y: true }, // 2: 右上角 → 只偏移y
  { x: false, y: false }, // 3: 右中 → 不偏移
  { x: false, y: false }, // 4: 右下角 → 不偏移
  { x: false, y: false }, // 5: 下中 → 不偏移
  { x: true, y: false }, // 6: 左下角 → 只偏移x
  { x: true, y: false }, // 7: 左中 → 只偏移x
];

export interface InteractResult {
  view: IView | null;
  content: IGraph | IViewAddon | null;
  extraData: ExtraData | null;
}

// 视图选项接口：TOREVIEW：content和children属性共存的设置是否合理
export interface ViewOptions<T extends object = any> {
  id?: string;
  name?: string;
  content?: IGraph; // 改为IGraph，多图形用组合图形替代
  children?: View[];
  parent?: ISceneNode | View;
  data?: T;
  properties?: T;
  style?: IViewStyle;
  matrix?: Matrix4;
  onCreated?: () => void;
  onAttach?: () => void;
  onDestroy?: () => void;
  [funcName: string]: any;
}

// TODO：不同容器的默认样式表
export default abstract class View<T extends object = any>
  implements IView, ISerializable
{
  // 基本属性
  public id: string = "";
  public name: string = "";
  public properties: T = {} as T;
  public data: T = {} as T;
  public content: IGraph | null;
  public children: View[] = [];
  public parent: ISceneNode | View | null = null;

  // 样式和状态
  public style: IViewStyle = {};
  public selected: boolean = false;
  public actived: boolean = false;
  public freezed: boolean = false;
  public visible: boolean = true;
  // 滚动条图形
  public scrollBarHorization: Rectangle | null = null;
  public scrollBarVertical: Rectangle | null = null;
  // 变换矩阵
  public matrix: Matrix4 = Matrix4.identity();
  // VP 矩阵缓存（由 Scene 在每帧渲染前广播设置）
  private _vpMatrix: Matrix4 = Matrix4.identity();
  // 滚动偏移量（由 layout 计算，渲染和交互时使用）
  public scrollOffset: { x: number; y: number } = { x: 0, y: 0 };
  // 插件
  public boundingBox: BoundingBoxAddon | null = null;
  // 视口
  public viewport: Bounds;
  // 内容布局区域
  public layoutArea: Bounds;
  // 类型
  public abstract readonly type: VIEWTYPE;
  //抽象方法
  public abstract copy(): View;

  // ==================== 动画系统 ====================
  private _animations: Animation[] = [];

  /**
   * 创建并播放动画，或挂载已有 Animation 实例并播放
   * @example
   * // 方式1：传入 Animation 实例
   * const anim = new Animation({ to: { x: 200 } }, { duration: 1000 })
   * view.animate(anim)
   *
   * // 方式2：KeyframeDefinition + options（自动创建 Animation）
   * view.animate({ to: { x: 200, y: 300 } }, { duration: 500, easing: Easings.easeOutCubic })
   *
   * // 方式3：带中间帧
   * view.animate({ '25': { x: 80 }, '75': { x: 180 }, to: { x: 200 } }, { duration: 1000 })
   */
  public animate(animation: Animation): Animation;
  public animate(
    definition: KeyframeDefinition,
    options: AnimationOptions,
  ): Animation;
  public animate(
    definitionOrAnimation: Animation | KeyframeDefinition,
    options?: AnimationOptions,
  ): Animation {
    // 如果传入的是 Animation 实例，直接绑定并播放
    if (definitionOrAnimation instanceof Animation) {
      const anim = definitionOrAnimation;
      anim._bindTarget(this);
      anim.play();
      return anim;
    }

    // 否则创建新的 Animation 实例
    const anim = new Animation(this, definitionOrAnimation, options!);
    anim.play();
    return anim;
  }

  /**
   * 获取渲染时应使用的属性值（动画计算值优先）
   * 从后向前遍历动画列表，后注册的动画优先级更高
   */
  public getAnimatedValue(prop: string): AnimatableValue | undefined {
    for (let i = this._animations.length - 1; i >= 0; i--) {
      const anim = this._animations[i];
      if (anim.isActive) {
        const val = anim.computedValues[prop];
        if (val !== undefined) return val;
      }
    }
    return undefined;
  }

  /**
   * 取消该 View 上的所有动画
   */
  public cancelAnimations(): void {
    const anims = [...this._animations];
    for (const anim of anims) {
      anim.cancel();
    }
  }

  /**
   * 立即完成该 View 上的所有动画
   */
  public finishAnimations(): void {
    const anims = [...this._animations];
    for (const anim of anims) {
      anim.finish();
    }
  }

  /** @internal 由 Animation 调用 */
  _addAnimation(anim: Animation): void {
    if (!this._animations.includes(anim)) {
      this._animations.push(anim);
    }
  }

  /** @internal 由 Animation 调用 */
  _removeAnimation(anim: Animation): void {
    const index = this._animations.indexOf(anim);
    if (index !== -1) {
      this._animations.splice(index, 1);
    }
  }

  /** @internal 由 Animation 调用 */
  _getAnimations(): Animation[] {
    return this._animations;
  }

  /**
   * 动画专用 resize 方法
   *
   * 模拟从右下角拖拽 + Ctrl 按下的效果：
   * 同时修改 viewport 尺寸和 content，等比缩放所有内容。
   *
   * @param targetWidth 目标宽度
   * @param targetHeight 目标高度
   * @internal
   */
  _animationResize(targetWidth: number, targetHeight: number): void {
    const viewport = this.viewport;
    if (!viewport) return;

    const oldWidth = viewport.width;
    const oldHeight = viewport.height;

    // 避免尺寸为 0
    if (targetWidth === 0 || targetHeight === 0) return;
    if (oldWidth === 0 || oldHeight === 0) return;

    // 计算增量 delta
    const deltaX = targetWidth - oldWidth;
    const deltaY = targetHeight - oldHeight;

    // 更新 viewport 尺寸（固定左上角，向右下角拓展）
    viewport.setSize(targetWidth, targetHeight);
    this.boundingBox?.updateSize();

    // resize content（模拟 needResizeContent = true 的效果）
    if (this.content) {
      // fixedPoint: viewport 起点（左上角）
      // dynamicPoint: viewport 右下角
      const fixedPoint = new Point3(viewport.x, viewport.y, 0);
      const dynamicPoint = new Point3(
        viewport.x + oldWidth,
        viewport.y + oldHeight,
        0,
      );
      // resizeVector: 尺寸变化量（本地坐标系）
      const resizeVector = new Vector3(deltaX, deltaY, 0);

      this.content.resize(fixedPoint, dynamicPoint, resizeVector);

      // 更新布局区域
      this.layoutArea = Bounds.union(
        this.content.bounds ?? Bounds.empty(),
        this.measureChildren(),
      );
      this.layout();
    }

    // 递归子 View（子 View 等比缩放）
    const scaleX = targetWidth / oldWidth;
    const scaleY = targetHeight / oldHeight;
    this.children.forEach((child) => {
      const childViewport = child.viewport;
      if (!childViewport) return;
      child._animationResize(
        childViewport.width * scaleX,
        childViewport.height * scaleY,
      );
    });
  }

  // 获取内容
  public layoutContent(): Bounds {
    // 内容布局区域，优先调用布局方法(主要只有文字需要进行内容布局)，然后看已有bounds
    // content 通过自身的 constraintBounds 获取排版约束，不再由外部传参
    return (
      this.content?.layout()?.bounds ?? this.content?.bounds ?? Bounds.empty()
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
    return Bounds.fromPoints(childRects.map((rect) => rect.vertices).flat());
  }

  public renderContent(ctx: CanvasRenderingContext2D): void {
    this.content?.render(ctx);
  }

  /**
   * 检查内容是否被命中，子类可以重写此方法实现自定义逻辑
   * @param point 相对坐标点
   */
  protected interactContent(point: Point3): InteractResult {
    if (!this.content) return { view: null, content: null, extraData: null };
    const hitContent =
      this.content.isPointInPath(point) ||
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

  protected interactPlugins(relativePoint: Point3): InteractResult {
    if (this.actived && this.boundingBox) {
      const extraData = this.boundingBox.interact(relativePoint);
      if (extraData) {
        return { view: this, content: this.boundingBox, extraData };
      }
    }
    return { view: null, content: null, extraData: null };
  }

  /**
   * 统一交互方法
   * 优先级：1. 插件 -> 2. 内容 -> 3. 子视图
   * @param worldPoint 世界坐标点
   */
  public interact(worldPoint: Point3): InteractResult {
    const relativePoint = this.getMVPMatrix().inverse().multiply(worldPoint);

    const ctx = getGlobalCanvasContext()?.getBufferContext();
    if (!ctx) throw new Error("交互失败");

    // 1. 检查插件（BoundingBox + 子类插件）—— 插件不随 scroll 移动，用原始坐标
    const pluginsResult = this.interactPlugins(relativePoint);
    if (pluginsResult.view) return pluginsResult;

    // 2. 补偿 scroll 偏移：内容和子视图在渲染时被 translate 了 scrollOffset，
    //    命中检测时需要反向补偿，将点转换到"内容坐标系"
    const scrolledPoint = new Point3(
      relativePoint.x - this.scrollOffset.x,
      relativePoint.y - this.scrollOffset.y,
      relativePoint.z,
    );

    // 3. 检查内容（复杂图形由子类重写）
    const contentResult = this.interactContent(scrolledPoint);
    if (contentResult.view) return contentResult;

    // 4. 递归检查子视图，数组靠后的 View 绘制在上方，优先命中
    //    将 scrolledPoint 转回世界坐标传给子视图，子视图再用自己的 MVP 逆矩阵转本地坐标
    const adjustedWorldPoint = this.getMVPMatrix().multiply(scrolledPoint);
    let best: InteractResult = { view: null, content: null, extraData: null };
    for (const child of this.children) {
      const childResult = child.interact(adjustedWorldPoint);
      if (childResult.view && childResult.content && childResult.extraData) {
        // 数组中靠后的 child 绘制在上方，后遍历的胜出
        best = childResult;
      }
    }

    return best;
  }

  constructor(options: ViewOptions<T>) {
    if (new Set(options?.children?.map((view) => view.parent)).size > 1) {
      throw new Error("子视图必须属于同一个父视图");
    }
    // 属性初始化
    this.id = options.id || "";
    this.data = options.data || ({} as T);
    this.properties = options.properties || ({} as T);
    this.style = {
      overflow: "visible",
      needStructViewport: false,
      ...(options.style || {}),
    };
    this.matrix = options.matrix ?? Matrix4.identity();
    this.content = options.content ?? null;
    this.children = options.children ?? [];
    this.parent = options.parent ?? null;

    this.onCreated = options.onCreated || (() => {});
    this.onAttach = options.onAttach || (() => {});
    this.onDestroy = options.onDestroy || (() => {});

    Object.keys(options).forEach((key) => {
      this[key] = options[key];
    });

    // 开始布局相关
    // 步骤1: 初始化视口
    this.viewport = new Bounds(
      0,
      0,
      options.style?.width || 0,
      options.style?.height || 0,
    );
    this.boundingBox = new BoundingBoxAddon(this.viewport);

    // 步骤2: 初始化布局区域(使用视口大小作为初始值)
    this.layoutArea = this.viewport.copy();

    // 步骤2.5: 初始化内容的排版约束区域为当前视口副本
    if (this.content) {
      this.content.constraintBounds = this.viewport.copy();
    }

    // 步骤3: 执行布局，布局目的
    // 1、不同容器独有的布局（比如文本容器）
    // 2、获取实际布局区域
    // 3、让内容区域进行偏移
    this.layout();

    this.initRef(this.children);

    this.onCreated();
  }

  // 设置数据
  public setData(data: Partial<T>): void {
    this.data = { ...this.data, ...data };
  }

  // 生命周期回调
  public onCreated(): void {}

  public onDestroy(): void {
    // 清理引用
    this.parent = null;
    this.content = null;
    this.children.forEach((child) => child.onDestroy());
    this.children = [];
    this.boundingBox = null;
    this.controlPoints = null;
    this.setEditingVertex(false);
    this.setEditingViewport(false);
    this.setEditingVertex(false);
  }

  public onAttach(): void {}

  initRef(children: View[]) {
    children.forEach((child) => {
      child.parent = this;
    });
  }

  // 自定义属性（索引签名）
  [funcName: string]: any;

  /**
   * 尺寸变化方向由三个因素决定：
   * 1. 视口当前尺寸方向（正/负）
   * 2. 参考向量的方向（本地坐标系下容器的变化方向）
   * 3. 传入向量的方向（预期变化方向，拖拽方向，是屏幕坐标系下的向量）
   */
  private calulateDimensionDelta(
    dimension: number,
    reference: number,
    delta: number,
  ) {
    return Math.sign(dimension * reference * delta) * Math.abs(delta);
  }

  public resize(
    fixedPoint: Point3,
    dynamicPoint: Point3,
    vector: Vector3,
    needResizeContent?: boolean,
  ) {
    const mvp = this.getMVPMatrix();
    // 拖拽方向只和屏幕坐标系有关，所以需要转换到世界坐标
    const relativeVector = mvp.inverse().multiply(vector);
    const handles = this.boundingBox?.handles;
    const viewport = this.viewport;
    if (!handles) throw new Error("包围盒插件丢失");
    if (!viewport) throw new Error("视口丢失");

    const referenceVector = dynamicPoint.subtract(fixedPoint);

    const deltaX = this.calulateDimensionDelta(
      viewport.width,
      referenceVector.x,
      relativeVector.x,
    );
    const deltaY = this.calulateDimensionDelta(
      viewport.height,
      referenceVector.y,
      relativeVector.y,
    );

    for (let [i, handler] of handles.entries()) {
      const v = handler.getCenter().subtract(handles[(i + 4) % 8].getCenter());
      //判断两个向量是否同向，用于判断是否可以修改尺寸（仅水平/垂直修改）
      if (
        1 - v.normalized.dot(referenceVector.normalized) <
        MathUtils.EPSILON
      ) {
        const canResize = RESIZE_SIZE_MAP[i];
        const newWidth = viewport.width + Number(canResize.width) * deltaX;
        const newHeight = viewport.height + Number(canResize.height) * deltaY;

        // 当resize结果为0时，不进行操作，避免后续计算出错
        // 1、calulateDimensionDelta出错导致视口不变化
        // 2、graph resize在边界时比例失调
        if (newWidth === 0 || newHeight === 0) return;

        // 根据手柄位置决定是否移动视口起点
        // 拖左侧/上方手柄时，起点需要反向偏移以保持固定点不动
        const canMoveOrigin = RESIZE_ORIGIN_MAP[i];
        this.viewport.setPosition(
          viewport.x + (canMoveOrigin.x ? -deltaX : 0),
          viewport.y + (canMoveOrigin.y ? -deltaY : 0),
        );

        this.viewport?.setSize(newWidth, newHeight);

        // boundingBox 直接从 viewport 引用读取最新位置和尺寸
        this.boundingBox?.updateSize();

        break;
      }
    }

    // 修改子容器。
    this.children.forEach((view) => {
      view.resize(fixedPoint, dynamicPoint, vector, needResizeContent);
    });

    if (needResizeContent && this.content) {
      // 修改内容
      this.content.resize(fixedPoint, dynamicPoint, relativeVector);
      // 更新完内容后更新实际布局区域
      this.layoutArea = Bounds.union(
        // this.viewport 先不加入视口区域，避免文本布局跟着视口跑
        this.content.bounds ?? Bounds.empty(),
        this.measureChildren(),
      );
      this.layout();
    }
  }

  // 渲染方法
  public render(): void {
    if (!this.visible) {
      return;
    }
    this.rederToOffScreen();

    // TODO：这里可以利用离屏画布内容对每个容器做监控

    this.renderFromCache();
  }

  private rederToOffScreen(): void {
    const canvasContext = getGlobalCanvasContext();

    const offscreenCtx = canvasContext.getBufferContext();
    const viewport = this.viewport;

    if (!viewport) {
      return;
    }
    offscreenCtx.save();

    const transform = this.getMVPMatrix().transform;
    offscreenCtx.setTransform(
      transform[0],
      transform[4],
      transform[1],
      transform[5],
      transform[3],
      transform[7],
    );

    // 渲染插件到离屏画布(不受裁剪作用的影响)
    this.renderPlugins(offscreenCtx);

    if (this.style.overflow !== "visible") {
      // 设置视口裁剪区域,offset通过viewport和layoutArea计算得出
      offscreenCtx.beginPath();
      offscreenCtx.rect(
        viewport.x,
        viewport.y,
        viewport.width,
        viewport.height,
      );
      offscreenCtx.clip();
    }

    // 应用 scroll 偏移后渲染内容和子节点
    // clip 已经建立，translate 只影响内容绘制位置，不影响裁剪区域
    offscreenCtx.save();
    offscreenCtx.translate(this.scrollOffset.x, this.scrollOffset.y);

    this.renderContent(offscreenCtx);
    this.children.forEach((view) => {
      if (!view.visible) return;
      view.rederToOffScreen();
    });

    offscreenCtx.restore(); // 恢复 scroll translate

    offscreenCtx.restore(); // 恢复 MVP setTransform
  }

  // 从缓存渲染到主画布
  private renderFromCache(): void {
    const canvasContext = getGlobalCanvasContext();
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

  // 渲染插件
  protected renderPlugins(ctx: CanvasRenderingContext2D): void {
    if (!this.actived) return;
    this.boundingBox?.render(ctx);
    // 滚动条始终在 clip 之前渲染，不会被裁掉
    this.scrollBarHorization?.render(ctx);
    this.scrollBarVertical?.render(ctx);
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

  // 布局管理
  public layout(): void {
    // 1、执行布局,获取最新的内容布局区域并更新
    const contentBounds = this.layoutContent(); // 拓展方向为第一个图形的拓展方向
    this.layoutArea = Bounds.union(
      this.viewport, // 将视口加入进来，主导布局区域的拓展方向，并且保证布局区域包含视口
      contentBounds,
      this.layoutArea,
    );
    if (this.style.needStructViewport) {
      this.viewport = this.layoutArea.copy();
      this.boundingBox = new BoundingBoxAddon(this.viewport);
    }
    // 2、计算scroll偏移（纯渲染层偏移，不修改content和children的数据）
    if (this.style.overflow === "scroll") {
      const scrollX = this.style.scrollX ?? 0;
      const scrollY = this.style.scrollY ?? 0;
      const la = this.layoutArea;
      const vp = this.viewport;

      // 可滚动范围 = 内容溢出视口的部分
      const maxScrollX = Math.abs(la.width) - Math.abs(vp.width);
      const maxScrollY = Math.abs(la.height) - Math.abs(vp.height);

      // clamp 到合法区间，不可滚动方向归零
      const clampedScrollX =
        maxScrollX > 0 ? Math.max(0, Math.min(scrollX, maxScrollX)) : 0;
      const clampedScrollY =
        maxScrollY > 0 ? Math.max(0, Math.min(scrollY, maxScrollY)) : 0;

      // scroll增大 → 内容向扩展方向的反方向移动
      this.scrollOffset = {
        x: -Math.sign(la.width) * clampedScrollX,
        y: -Math.sign(la.height) * clampedScrollY,
      };

      // 更新滚动条
      this.updateScrollBars(
        clampedScrollX,
        clampedScrollY,
        maxScrollX,
        maxScrollY,
      );
    } else {
      // 非scroll模式，清零偏移和滚动条
      this.scrollOffset = { x: 0, y: 0 };
      this.scrollBarHorization = null;
      this.scrollBarVertical = null;
    }
  }

  /**
   * 更新滚动条的尺寸和位置
   * 滚动条长度 = 视口尺寸的平方 / 布局区域尺寸（等比例缩放）
   * 滚动条位置 = 根据滚动进度在视口范围内线性插值
   */
  private updateScrollBars(
    scrollX: number,
    scrollY: number,
    maxScrollX: number,
    maxScrollY: number,
  ): void {
    const vp = this.viewport;
    const SCROLLBAR_THICKNESS = 4;

    // 水平滚动条
    if (maxScrollX > 0) {
      const ratio = Math.abs(vp.width) / Math.abs(this.layoutArea.width);
      const barWidth = vp.width * ratio;
      const travel = Math.abs(vp.width) - Math.abs(barWidth);
      const progress = scrollX / maxScrollX;
      const barX = vp.x + Math.sign(vp.width) * progress * travel;
      const barHeight = SCROLLBAR_THICKNESS * Math.sign(vp.height);
      const barY = vp.y + vp.height - barHeight;
      this.scrollBarHorization = new Rectangle(barX, barY, barWidth, barHeight);
    } else {
      this.scrollBarHorization = null;
    }

    // 垂直滚动条
    if (maxScrollY > 0) {
      const ratio = Math.abs(vp.height) / Math.abs(this.layoutArea.height);
      const barHeight = vp.height * ratio;
      const travel = Math.abs(vp.height) - Math.abs(barHeight);
      const progress = scrollY / maxScrollY;
      const barY = vp.y + Math.sign(vp.height) * progress * travel;
      const barWidth = SCROLLBAR_THICKNESS * Math.sign(vp.width);
      const barX = vp.x + vp.width - barWidth;
      this.scrollBarVertical = new Rectangle(barX, barY, barWidth, barHeight);
    } else {
      this.scrollBarVertical = null;
    }
  }

  // ==================== 序列化 ====================

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
      properties: this.properties,
      data: this.data,
      style: this.style,
      matrix: this.matrix.toJSON(),
      viewport: this.viewport.toJSON(),
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
