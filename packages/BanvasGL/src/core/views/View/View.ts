import { VIEWTYPE } from "../../constants";
import Style from "../../style/Style";
import Matrix4 from "../../math/Matrix4";
import { getGlobalCanvasContext } from "../../renderer/CanvasContext";
import { v4 as uuidv4 } from "uuid";
import { isScene, type Scene } from "../../scene/Scene";
import BaseCamera from "../../camera/BaseCamera";

// 导入图形相关类型
import { Graph } from "../../graph";

// 导入addon类型
import { BoundingBoxAddonImpl, VertexAddonImpl, ViewAddonImpl } from "../addon";
import { Point3, Vector3 } from "../../math";
import { ExtraData } from "./InteractionMapBuilder";
import Bounds from "../../graph/base/Bounds";

const RESIZE_MATRIX_MAP = [
  { x: true, y: true },  // 0: 同时移动x和y
  { x: false, y: true }, // 1: 只移动y
  { x: false, y: true }, // 2: 只移动y
  { x: false, y: false }, // 3: 不移动
  { x: false, y: false }, // 4: 不移动
  { x: false, y: false }, // 5: 不移动
  { x: true, y: false }, // 6: 只移动x
  { x: true, y: false }, // 7: 只移动x
];

const RESIZE_SIZE_MAP = [
  { width: true, height: true },
  { width: false, height: true },
  { width: true, height: true },
  { width: true, height: false },

  { width: true, height: true },
  { width: false, height: true },
  { width: true, height: true },
  { width: true, height: false },
]


export interface InteractResult {
  view: View | null;
  content: ViewContent | ViewAddonImpl | null;
  extraData: ExtraData | null;
}

// 内容类型联合
export type ViewContent = Graph[];

export interface ViewStyle {
  width?: number;
  height?: number;
  overflow?: "visible" | "hidden" | "scroll";
  layoutArea?: Style
  content?: Style[]
}
// 视图选项接口
export interface ViewOptions<T extends object = any> {
  id?: string;
  content?: ViewContent;
  children?: View[];
  data?: T;
  properties?: T;
  style?: ViewStyle;// TODO:继承关系和初始化，兼顾拓展性
  matrix?: Matrix4;
  onCreated?: () => void;
  onAttach?: () => void;
  onDestroy?: () => void;
  [funcName: string]: any;
}


export default abstract class View<T extends object = any> {
  // 基本属性
  public layer: number = 0;
  public id: string = "";
  public properties: T = {} as T;
  public data: T = {} as T;
  public content: ViewContent = [];
  public children: View[] = [];
  public parent: Scene | View | null = null;

  // 样式和状态
  public style: ViewStyle = {};
  public selected: boolean = false;
  public actived: boolean = false;
  public freezed: boolean = false;
  public visible: boolean = true;

  // 变换矩阵
  public matrix: Matrix4 = Matrix4.identity();

  // 插件
  public boundingBox: BoundingBoxAddonImpl | null = null;

  // 视口
  public viewport: Bounds | null = null
  // 内容布局区域
  public layoutArea: Bounds | null = null

  // 类型
  public readonly abstract type: VIEWTYPE;

  //抽象方法
  public abstract renderContent(ctx: CanvasRenderingContext2D): void;
  public abstract copy(): View;
  public abstract interact(worldPoint: Point3): InteractResult

  constructor(options: ViewOptions<T>) {
    this.id = options.id || this.generateId();
    this.data = options.data || {} as T;
    this.properties = options.properties || {} as T;
    this.style = options.style || {};
    this.matrix = options.matrix || Matrix4.identity();
    this.content = options.content || [];
    this.children = options.children || [];
    this.onCreated = options.onCreated || (() => { });
    this.onAttach = options.onAttach || (() => { });
    this.onDestroy = options.onDestroy || (() => { });

    Object.keys(options).forEach((key) => {
      this[key] = options[key];
    });

    this.viewport = new Bounds(0, 0, options.style?.width || 0, options.style?.height || 0);
    this.layoutArea = new Bounds(0, 0, options.style?.width || 0, options.style?.height || 0);
    this.boundingBox = new BoundingBoxAddonImpl(this.viewport);

    this.onCreated();
  }

  // 设置数据
  public setData(data: Partial<T>): void {
    this.data = { ...this.data, ...data };
  }

  // 生命周期回调
  public onCreated(): void { }

  public onDestroy(): void {
    // 清理引用
    this.parent = null;
    this.content = [];
    this.children.forEach(child => child.onDestroy());
    this.children = [];
    this.viewport = null;
    this.layoutArea = null;
    this.boundingBox = null;
    this.controlPoints = null;
    this.setEditingVertex(false)
    this.setEditingViewport(false)
    this.setEditingVertex(false);
  }

  public onAttach(): void { }

  // 自定义属性（索引签名）
  [funcName: string]: any;

  /**
   * 尺寸变化方向由三个因素决定：
   * 1. 视口当前尺寸方向（正/负）
   * 2. 参考向量的方向（拖拽方向）
   * 3. 传入向量的方向（预期变化方向）
   */
  private calulateDimensionDelta(dimension: number, reference: number, delta: number) {
    return Math.sign(dimension * reference * delta) * Math.abs(delta);
  }

  private updateViewport(fixed: [number, Point3], dynamic: [number, Point3], vector: Vector3) {
    const mvp = this.getMVPMatrix()
    const relativeVector = mvp.inverse().multiply(vector)
    const viewport = this.viewport
    if (!viewport) throw new Error("视口丢失")
    const referenceVector = dynamic[1].subtract(fixed[1])

    const deltaX = this.calulateDimensionDelta(viewport.width || 1, referenceVector.x || 1, relativeVector.x)
    const deltaY = this.calulateDimensionDelta(viewport.height || 1, referenceVector.y || 1, relativeVector.y)

    // || 1是为了避免跨界是计算出错，保证按照delta变化
    const canResize = RESIZE_SIZE_MAP[dynamic[0]]
    const newWidth = viewport.width + Number(canResize.width) * deltaX
    const newHeight = viewport.height + Number(canResize.height) * deltaY

    this.viewport?.setSize(newWidth, newHeight)

    this.boundingBox?.setSize(viewport.width, viewport.height)

    // 修改matrix（由dynamicIndex决定）
    const canTranslate = RESIZE_MATRIX_MAP[dynamic[0]];
    const translateVector = mvp.multiply(new Vector3(
      canTranslate.x ? -deltaX : 0,
      canTranslate.y ? -deltaY : 0,
      0
    ))
    this.translate(translateVector.x, translateVector.y, translateVector.z);
  }

  public resize(fixed: [number, Point3], dynamic: [number, Point3], vector: Vector3, needResizeContent?: boolean) {
    // 修改视口(只会修改width和height，根据参考向量与vector的关系决定)
    this.updateViewport(fixed, dynamic, vector)

    // 修改子容器
    this.children.forEach(view => {
      view.resize(fixed, dynamic, vector, needResizeContent)
    })

    if (needResizeContent) {
      // 修改内容
      this.content.forEach(graph => graph.resize(fixed[1], dynamic[1], vector))
    }
  };

  // 渲染方法
  public render(): void {
    if (!this.visible) {
      return;
    }
    this.rederToOffScreen()

    this.renderFromCache()
  }


  private rederToOffScreen(): void {
    const canvasContext = getGlobalCanvasContext();

    const offscreenCtx = canvasContext.getBufferContext();
    const viewport = this.viewport;

    if (!viewport) {
      return;
    }
    offscreenCtx.save()

    const transform = this.getMVPMatrix().transform
    offscreenCtx.setTransform(transform[0], transform[4], transform[1], transform[5], transform[3], transform[7]);

    // 渲染插件到离屏画布(不受裁剪作用的影响)
    this.renderPlugins(offscreenCtx);

    if (this.style.overflow !== 'visible') {
      // 设置视口裁剪区域,offset通过viewport和layoutArea计算得出
      offscreenCtx.beginPath();
      offscreenCtx.rect(viewport.x, viewport.y, viewport.width, viewport.height);
      offscreenCtx.clip();
    }

    // 渲染内容到离屏画布
    this.renderContent(offscreenCtx);

    // 渲染子节点
    this.children.forEach((view) => {
      view.render();
    });

    offscreenCtx.restore()
  }

  // 从缓存渲染到主画布
  private renderFromCache(): void {
    const canvasContext = getGlobalCanvasContext();
    const mainCtx = canvasContext.getMainContext();
    const offscreenCtx = canvasContext.getBufferContext();
    if (!offscreenCtx) return;
    const canvas = offscreenCtx.canvas as unknown as OffscreenCanvas
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
  private renderPlugins(ctx: CanvasRenderingContext2D): void {
    if (!this.actived) return;
    this.boundingBox?.render(ctx);
  }

  // 获取世界矩阵（考虑父view的matrix）
  public getWorldMatrix(parent?: View): Matrix4 {
    if (this.parent && this.parent instanceof View && this.parent !== parent) {
      // 如果有父view，则世界矩阵 = 父view的世界矩阵 * 当前view的matrix
      return this.parent.getWorldMatrix().copy().multiply(this.matrix);
    } else {
      // 如果没有父view，则世界矩阵就是当前view的matrix
      return this.matrix.copy();
    }
  }

  public getMVPMatrix() {
    return this.getCamera()?.viewProjectionMatrix.multiply(this.getWorldMatrix()) || this.getWorldMatrix()
  }

  // 变换方法
  public translate(x: number, y: number, z: number = 0): View {
    this.matrix.translate(x, y, z);
    return this;
  }

  public scale(x: number, y: number, z: number = 1, origin: Point3 = new Point3(0, 0, 0)): View {
    const _o = this.matrix.multiply(origin);
    this.matrix.translate(-_o.x, -_o.y, -_o.z);
    this.matrix.scale(x, y, z);
    this.matrix.translate(_o.x, _o.y, _o.z);
    return this;
  }

  public rotate(x: number, y: number, z: number, origin: Point3 = new Point3(0, 0, 0)): View {
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
  public setStyle(style: ViewStyle): View {
    this.style = { ...this.style, ...style };
    return this;
  }

  // 内容管理
  public setContent(content: ViewContent): View {
    this.content = content;
    return this;
  }

  public getContent(): ViewContent {
    return this.content;
  }

  // 获取当前视图所属场景的相机
  private getCamera(): BaseCamera | null {
    // 向上查找父级，直到找到 Scene
    let current: Scene | View | null = this.parent;
    while (current) {
      if (isScene(current)) {
        return current.camera;
      }
      current = current.parent;
    }
    return null;
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
