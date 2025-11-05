import { VIEWTYPE } from "../../constants";
import Style from "../style/Style";
import Matrix4 from "../math/Matrix4";
import CanvasContext, {
  getGlobalCanvasContext,
} from "../renderer/CanvasContext";
import { v4 as uuidv4 } from "uuid";
import Scene from "../scene/Scene";

// 导入图形相关类型
import { Graph } from "../graph";

// 导入addon类型
import {
  BoundingBoxAddonImpl,
  ViewportAddonImpl,
  VertexAddonImpl,
  ViewAddonImpl,
} from "./addon";
import { Point3 } from "../math";
import { ExtraData } from "./addon/InteractionMapBuilder";

// 视图选项接口
export interface ViewOptions<T extends object = any> {
  id?: string;
  content?: ViewContent;
  data?: T;
  properties?: T;
  style?: Style;
  matrix?: Matrix4; // 变换矩阵
  onCreated?: () => void;
  onAttach?: () => void;
  onDestroy?: () => void;
  [funcName: string]: any;
}

// 内容类型联合
export type ViewContent = Graph | Graph[] | null;

export default abstract class View<T extends object = any> {
  // 基本属性
  public readonly type: VIEWTYPE = VIEWTYPE.VIEW;
  public layer: number = 0;
  public id: string = "";
  public properties: T = {} as T;
  public data: T = {} as T;

  // 抽象内容属性 - 子类必须实现
  public abstract content: ViewContent;
  public abstract children: View[];

  // 层级关系
  public parent: Scene | View | null = null;
  public sibling: View | null = null;

  // 样式和状态
  public style: Style = new Style();
  public selected: boolean = false;
  public actived: boolean = false;
  public freezed: boolean = false;
  public visible: boolean = true;

  // 变换矩阵
  public matrix: Matrix4 = Matrix4.identity();

  // 插件
  public viewport: ViewportAddonImpl | null = null;
  public controlPoints: VertexAddonImpl | null = null;
  public boundingBox: BoundingBoxAddonImpl | null = null;

  // 私有属性
  private _isConstructed: boolean = false;
  private _isDestroyed: boolean = false;

  //抽象方法
  public abstract renderContent(ctx: CanvasRenderingContext2D): void;
  public abstract copy(): View;
  public abstract getContentBounds(): {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  public abstract interact(p: Point3): {
    view: View | null;
    content: ViewContent | ViewAddonImpl | null;
    extraData: ExtraData | null;
  };

  constructor(options: ViewOptions<T>) {
    this.construct(options);
  }

  // 构造方法
  public construct(vo: ViewOptions<T>): void {
    if (this._isConstructed) {
      console.warn("View is already constructed");
      return;
    }

    // 生成或设置ID
    this.id = vo.id || this.generateId();

    // 设置基本属性
    if (vo.data !== undefined) {
      this.data = vo.data;
    }
    if (vo.properties !== undefined) {
      this.properties = vo.properties;
    }

    // 设置样式
    if (vo.style) {
      this.style = vo.style;
    }

    // 设置变换矩阵
    if (vo.matrix) {
      this.matrix = vo.matrix;
    }

    // 设置回调函数
    if (vo.onCreated) {
      this.onCreated = vo.onCreated;
    }
    if (vo.onAttach) {
      this.onAttach = vo.onAttach;
    }
    if (vo.onDestroy) {
      this.onDestroy = vo.onDestroy;
    }

    // 设置其他自定义方法
    Object.keys(vo).forEach((key) => {
      if (
        typeof vo[key] === "function" &&
        !["onCreated", "onAttach", "onDestroy"].includes(key)
      ) {
        (this as any)[key] = vo[key];
      }
    });

    this._isConstructed = true;
    this.onCreated();
  }

  // 设置数据
  public setData(data: Partial<T>): void {
    this.data = { ...this.data, ...data };
  }

  // 生命周期回调
  public onCreated(): void {}

  public onDestroy(): void {
    if (this._isDestroyed) {
      return;
    }
    this._isDestroyed = true;

    // 清理引用
    this.parent = null;
    this.sibling = null;
    this.content = null;
  }

  public onAttach(): void {}

  // 自定义方法（索引签名）
  [funcName: string]: any;

  // 视图判断
  public isView(): boolean {
    return true;
  }

  // 渲染方法
  public render(): void {
    if (!this.visible || this._isDestroyed) {
      return;
    }

    const canvasContext = getGlobalCanvasContext();
    if (!canvasContext) {
      console.warn("Global CanvasContext not initialized");
      return;
    }

    // 检查是否需要视口裁剪
    const needsViewportCulling = this.needsViewportCulling();

    if (needsViewportCulling) {
      // 使用离屏画布渲染
      this.renderWithOffscreen(canvasContext);
    } else {
      // 直接在主画布渲染
      this.renderDirectly(canvasContext);
    }
  }

  // 直接渲染到主画布
  private renderDirectly(canvasContext: CanvasContext): void {
    // 渲染插件（如果是激活状态并且有对应插件）
    this.renderPlugins(canvasContext.getMainContext());
    // 渲染内容
    this.renderContent(canvasContext.getMainContext());
    // 渲染子节点
    this.renderChildren(canvasContext);
    const ctx = canvasContext.getMainContext();
    ctx.save();
    ctx.fillStyle = "#000";
    ctx.textBaseline = "top";
    ctx.fillText(this.id, 0, 0);
    ctx.restore();
  }

  private renderChildren(ctx: CanvasContext) {
    if (this.children.length === 0) return;

    this.children.forEach((view) => {
      ctx.save();
      const transform = view.matrix.transform;
      ctx.transform([
        transform[0],
        transform[4],
        transform[1],
        transform[5],
        transform[3],
        transform[7],
      ]);
      view.render();
      ctx.restore();
    });
  }

  // 使用离屏画布渲染
  private renderWithOffscreen(canvasContext: CanvasContext): void {
    const offscreenCtx = canvasContext.getBufferContext();
    if (!offscreenCtx || !this.viewport) {
      // 如果没有离屏画布，回退到直接渲染
      this.renderDirectly(canvasContext);
      return;
    }

    // 重新渲染到离屏画布
    this.renderToOffscreen(canvasContext);

    // 从离屏画布渲染到主画布
    this.renderFromCache(canvasContext);
  }

  // 渲染到离屏画布
  private renderToOffscreen(canvasContext: CanvasContext): void {
    const offscreenCtx = canvasContext.getBufferContext();
    const viewport = this.viewport;
    if (!offscreenCtx || !viewport) return;

    // 清空离屏画布
    offscreenCtx.clearRect(
      0,
      0,
      offscreenCtx.canvas.width,
      offscreenCtx.canvas.height
    );

    // 先设置视口裁剪区域
    offscreenCtx.beginPath();
    offscreenCtx.rect(viewport.x, viewport.y, viewport.width, viewport.height);
    offscreenCtx.clip();

    // 渲染插件到离屏画布（如果是激活状态并且有对应插件）
    this.renderPlugins(offscreenCtx);

    // 渲染内容到离屏画布
    this.renderContent(offscreenCtx);

    // 渲染子节点
    this.renderChildren(canvasContext);
  }

  // 从缓存渲染到主画布
  private renderFromCache(canvasContext: CanvasContext): void {
    const mainCtx = canvasContext.getMainContext();
    const offscreenCtx = canvasContext.getBufferContext();
    if (!offscreenCtx) return;
    // 将离屏画布内容绘制到主画布
    /**
     * 注意
     * 需要将两个画布的变换都清零
     * 让缓冲区内容能够绘制到正确的地方
     */
    canvasContext.save();
    canvasContext.setTransform([0, 0, 0, 0, 0, 0]);
    mainCtx.drawImage(offscreenCtx.canvas, 0, 0);
    canvasContext.restore();
  }

  // 渲染插件
  private renderPlugins(ctx: CanvasRenderingContext2D): void {
    if (!this.actived) return;
    if (
      this.controlPoints &&
      typeof (this.controlPoints as any).render === "function"
    ) {
      (this.controlPoints as any).render(ctx);
    }
    if (
      this.boundingBox &&
      typeof (this.boundingBox as any).render === "function"
    ) {
      (this.boundingBox as any).render(ctx);
    }
    if (this.viewport && typeof (this.viewport as any).render === "function") {
      (this.viewport as any).render(ctx);
    }
  }

  // 检查是否需要视口裁剪
  private needsViewportCulling(): boolean {
    const viewport = this.viewport;

    if (!viewport) {
      return false;
    }

    // 检查内容是否超出视口边界
    return this.hasContentOutsideViewport(viewport);
  }

  // 检查内容是否在视口外
  private hasContentOutsideViewport(viewport: ViewportAddonImpl): boolean {
    // 获取内容的边界框
    const contentBounds = this.getContentBounds();
    if (!contentBounds) {
      return false;
    }

    // 检查边界框是否与视口相交
    return (
      contentBounds.x < viewport.x ||
      contentBounds.y < viewport.y ||
      contentBounds.x + contentBounds.width > viewport.width ||
      contentBounds.y + contentBounds.height > viewport.height
    );
  }

  public initBoundingBox(): void {
    const bounds = this.getContentBounds();

    const width = Math.max(0, bounds.x + bounds.width);
    const height = Math.max(0, bounds.y + bounds.height);
    this.boundingBox = new BoundingBoxAddonImpl(width, height);
  }

  public initViewport(): void {
    const bounds = this.boundingBox?.getBounds();
    if (!bounds) throw new Error("Bounding box is not set");

    this.viewport = new ViewportAddonImpl(
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height
    );
  }

  public getLastRenderTime(): number {
    return this._lastRenderTime;
  }

  // 获取世界矩阵（考虑父view的matrix）
  public getWorldMatrix(): Matrix4 {
    if (this.parent && this.parent instanceof View) {
      // 如果有父view，则世界矩阵 = 父view的世界矩阵 * 当前view的matrix
      return this.parent.getWorldMatrix().copy().multiply(this.matrix);
    } else {
      // 如果没有父view，则世界矩阵就是当前view的matrix
      return this.matrix.copy();
    }
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
    origin: Point3 = new Point3(0, 0, 0)
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
    origin: Point3 = new Point3(0, 0, 0)
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

  public setLayer(layer: number): View {
    this.layer = layer;
    return this;
  }

  // 样式管理
  public setStyle(style: Style): View {
    this.style = style.copy();
    return this;
  }

  /**
   * 获取View的边界框（使用BoundingBoxAddon计算）
   * 返回包含内容大小和内边距的边界框
   */
  public getBounds(): {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null {
    if (!this.boundingBox) {
      return null;
    }

    // 使用BoundingBoxAddon计算边界框（内容大小 + 内边距）
    return this.boundingBox.getBounds();
  }

  // 内容管理
  public setContent(content: ViewContent): View {
    this.content = content;
    return this;
  }

  public getContent(): ViewContent {
    return this.content;
  }

  // 销毁视图
  public destroy(): void {
    this.onDestroy();
  }

  // 生成唯一ID
  private generateId(): string {
    return uuidv4();
  }
}
