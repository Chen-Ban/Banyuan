import { GRAPHTYPE } from "@/core/constants";
import Graph from "@/core/graph/base/Graph";
import { Point3, Vector3, Matrix4 } from "@/core/math";
import { Style, Color } from "@/core/style";
import TextOptions from "./TextOptions";
import Bounds from "../base/Bounds";
import { getGlobalCanvasContext } from "@/core/renderer/CanvasContext";
import { Rectangle } from "../combined";

/**
 * 文字元素类
 * 表示单个文字元素，是最小的文字单位
 */
export default class TextElement extends Graph {
  public type: GRAPHTYPE = GRAPHTYPE.TEXTELEMENT;
  public controlPoints: Point3[];
  public _style: Style;
  public _options: TextOptions;
  public _content: string;
  public isLayouted: boolean = false;
  public width: number = 0;
  public height: number = 0;
  public lineHeight: number = 0;

  constructor(content: string, options: TextOptions = TextOptions.DEFAULT, style: Style = Style.DEFAULT) {
    super();

    if (content.length > 1) throw new Error("TextElement content must be a single character");
    this._content = content;
    this._options = options;
    this._style = style;

    this.calculateActualDimensions();

    // 初始化时不设置控制点,包围盒和具体行高，等待布局时设置
    this.controlPoints = [];
  }

  public getLength(tStart: number, tEnd: number): number {
    return 1;
  }

  public getPointAt(t: number): Point3 {
    return this.controlPoints[0];
  }

  /**
   * 计算文字的实际宽高
   */
  private calculateActualDimensions(): void {
    const ctx = getGlobalCanvasContext()?.getBufferContext();
    if (!ctx) throw new Error("无法获取真实字体尺寸");
    ctx.save();
    // 设置字体样式
    ctx.font = this.options.fontString;

    // 测量文字尺寸
    const metrics = ctx.measureText(this._content);
    this.width = metrics.width;
    this.height = this.options.size;
    ctx.restore();
  }

  public calculateBounds(): Bounds {
    if (this.isLayouted && this.controlPoints.length > 0) {
      return new Bounds(
        this.controlPoints[0].x,
        this.controlPoints[0].y - this.lineHeight + this.height,
        this.width + this.options.letterSpacing,
        this.lineHeight
      );
    } else {
      return Bounds.empty();
    }
  }

  /**
   * 设置选项
   */
  set options(options: TextOptions) {
    this._options = options;
    // 重新计算尺寸，因为字体选项可能已改变
    this.calculateActualDimensions();
  }

  get options() {
    return this._options;
  }

  /**
   * 设置文字内容
   */
  set content(content: string) {
    if (content.length > 1) throw new Error("TextElement content must be a single character");
    this._content = content;
    // 重新计算尺寸，因为文字内容已改变
    this.calculateActualDimensions();
  }

  get content() {
    return this._content;
  }

  set style(style: Style) {
    this._style = style;
    // 重新计算尺寸，因为文字内容已改变
    this.calculateActualDimensions();
  }
  get style() {
    return this._style;
  }

  /**
   * 布局方法 - 在TextView中调用时设置位置和计算包围盒
   */
  public layout(position: Point3, lineHeight: number): TextElement {
    this.isLayouted = true;
    this.controlPoints = [position.copy()];
    this.lineHeight = lineHeight;
    // 计算包围盒并设置正确的controlPoints
    this.setBounds(this.calculateBounds());
    return this;
  }

  public renderPath(ctx: CanvasRenderingContext2D, dependent: Boolean): void {
    dependent && ctx.beginPath();
    const bounds = this.getBounds();
    ctx.moveTo(bounds.x, bounds.y);
    ctx.lineTo(bounds.x + bounds.width, bounds.y);
    ctx.lineTo(bounds.x + bounds.width, bounds.y + bounds.height);
    ctx.lineTo(bounds.x, bounds.y + bounds.height);
    ctx.lineTo(bounds.x, bounds.y);
  }

  /**
   * 渲染文字元素
   */
  public render(ctx: CanvasRenderingContext2D): void {
    ctx.save();

    // 设置字体样式
    ctx.font = this.options.fontString;
    //字体基线
    ctx.textBaseline = "top";

    // 应用样式（但不覆盖文字颜色）
    const bounds = this.getBounds();
    this.style.applyToContext(ctx, bounds.width, bounds.height);

    // 设置文字颜色（在应用样式后设置，确保不被覆盖）
    ctx.fillStyle = this.options.color.rgba;
    // 绘制文字
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.1)";
    ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    ctx.restore();
    ctx.fillText(this.content, this.controlPoints[0].x, this.controlPoints[0].y);
    ctx.restore();
  }

  isPointOnCurve(point: Point3, tolerance: number = 1e-6): boolean {
    const bounds = this.getBounds();
    return new Rectangle(bounds.x, bounds.y, bounds.width, bounds.height).isPointOnCurve(point, tolerance);
  }

  public getTangentAt(t: number): Vector3 {
    const bounds = this.getBounds();
    const perimeter = 2 * (bounds.width + bounds.height);
    let currentLength = 0;

    // 上边：向右
    if (t * perimeter <= bounds.width) {
      return new Vector3(1, 0, 0);
    }
    currentLength += bounds.width;

    // 右边：向下
    if (t * perimeter <= currentLength + bounds.height) {
      return new Vector3(0, 1, 0);
    }
    currentLength += bounds.height;

    // 下边：向左
    if (t * perimeter <= currentLength + bounds.width) {
      return new Vector3(-1, 0, 0);
    }

    // 左边：向上
    return new Vector3(0, -1, 0);
  }

  public getNormalAt(t: number): Vector3 {
    const tangent = this.getTangentAt(t);
    return new Vector3(-tangent.y, tangent.x, 0);
  }

  public getClosestPoint(point: Point3): {
    distance: number;
    closestPoint: Point3;
    parameter: number;
  } {
    const bounds = this.getBounds();
    const closestX = Math.max(bounds.x, Math.min(point.x, bounds.x + bounds.width));
    const closestY = Math.max(bounds.y, Math.min(point.y, bounds.y + bounds.height));
    const closestPoint = new Point3(closestX, closestY, 0);
    const distance = Math.sqrt(Math.pow(point.x - closestPoint.x, 2) + Math.pow(point.y - closestPoint.y, 2));

    // 计算参数t（基于周长）
    const perimeter = 2 * (bounds.width + bounds.height);
    let t = 0;
    if (closestX === bounds.x + bounds.width && closestY === bounds.y) {
      // 右上角
      t = bounds.width / perimeter;
    } else if (closestX === bounds.x + bounds.width && closestY === bounds.y + bounds.height) {
      // 右下角
      t = (bounds.width + bounds.height) / perimeter;
    } else if (closestX === bounds.x && closestY === bounds.y + bounds.height) {
      // 左下角
      t = (2 * bounds.width + bounds.height) / perimeter;
    } else if (closestX === bounds.x && closestY === bounds.y) {
      // 左上角
      t = 0;
    } else if (closestY === bounds.y) {
      // 上边
      t = (closestX - bounds.x) / perimeter;
    } else if (closestX === bounds.x + bounds.width) {
      // 右边
      t = (bounds.width + closestY - bounds.y) / perimeter;
    } else if (closestY === bounds.y + bounds.height) {
      // 下边
      t = (bounds.width + bounds.height + bounds.width - (closestX - bounds.x)) / perimeter;
    } else {
      // 左边
      t = (2 * bounds.width + bounds.height + bounds.height - (closestY - bounds.y)) / perimeter;
    }

    return { distance, closestPoint, parameter: t };
  }

  public getArea(): number {
    const bounds = this.getBounds();
    return bounds.width * bounds.height;
  }

  public getCentroid(): Point3 {
    const bounds = this.getBounds();
    return new Point3(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, 0);
  }

  public transform(matrix: Matrix4): Graph {
    if (this.controlPoints.length > 0) {
      this.controlPoints[0] = matrix.multiply(this.controlPoints[0]);
      this.setBounds(this.calculateBounds());
    }
    return this;
  }

  /**
   * 复制文字元素
   */
  public copy(): this {
    const newElement = new TextElement(this.content, this.options.copy(), this.style.copy());

    if (this.isLayouted) {
      newElement.layout(this.controlPoints[0].copy(), this.lineHeight);
    }
    return newElement as this;
  }

  /**
   * 静态工厂方法 - 创建简单文字元素
   */
  static simple(content: string, size: number = 16, color: string = "#000000"): TextElement {
    const options = new TextOptions();
    options.size = size;
    // 从字符串创建Color对象
    const colorObj = Color.fromHex(color);
    options.color = colorObj;

    return new TextElement(content, options);
  }

  /**
   * 静态工厂方法 - 创建标题文字元素
   */
  static title(content: string, size: number = 24): TextElement {
    const options = TextOptions.title();
    options.size = size;

    return new TextElement(content, options);
  }

  /**
   * 静态工厂方法 - 创建粗体文字元素
   */
  static bold(content: string, size: number = 16): TextElement {
    const options = TextOptions.bold();
    options.size = size;

    return new TextElement(content, options);
  }

  /**
   * 静态工厂方法 - 创建斜体文字元素
   */
  static italic(content: string, size: number = 16): TextElement {
    const options = TextOptions.italic();
    options.size = size;

    return new TextElement(content, options);
  }
}
