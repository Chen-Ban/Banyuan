import { GRAPHTYPE } from "@/constants";
import Graph, { GraphOptions } from "@/core/graph/base/Graph";
import { Point3 } from "@/core/math";
import { Style, Color } from "@/core/style";
import TextOptions from "./TextOptions";
import Bounds from "../base/Bounds";

/**
 * 文字元素类
 * 表示单个文字元素，是最小的文字单位
 */
export default class TextElement extends Graph {
  public type: GRAPHTYPE = GRAPHTYPE.TEXTELEMENT;
  public controlPoints: Point3[];
  public style: Style;
  public options: TextOptions;
  public content: string;
  public position: Point3;
  public isLayouted: boolean = false;
  public width: number = 0;
  public height: number = 0;

  constructor(
    content: string,
    options: TextOptions = TextOptions.DEFAULT,
    style: Style = Style.DEFAULT,
    graphOptions?: GraphOptions
  ) {
    super(graphOptions);

    if (content.length > 1)
      throw new Error("TextElement content must be a single character");
    this.content = content;
    this.position = new Point3(0, 0, 0); // 初始位置设为原点，等待布局时设置
    this.options = options;
    this.style = style;

    // 在初始化时计算并缓存实际的宽高
    this.calculateActualDimensions();

    // 初始化时不设置控制点，等待布局时设置
    this.controlPoints = [];
    // 不计算包围盒，等待布局时计算
  }

  /**
   * 计算并缓存文字的实际宽高
   */
  private calculateActualDimensions(): void {
    // 创建临时Canvas上下文来测量文字尺寸
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      // 如果无法创建上下文，使用估算值
      this.width = this.options.size * 0.6; // 估算宽度
      this.height = this.options.size; // 估算高度
      return;
    }

    // 设置字体样式
    ctx.font = this.options.fontString;

    // 测量文字尺寸
    const metrics = ctx.measureText(this.content);
    this.width = metrics.width;
    this.height = this.options.size;
  }

  protected calculateBounds(): Bounds {
    if (this.isLayouted) {
      // 设置四个角点作为controlPoints
      this.controlPoints = [
        new Point3(this.position.x, this.position.y, 0), // 左上角
        new Point3(this.position.x + this.width, this.position.y, 0), // 右上角
        new Point3(
          this.position.x + this.width,
          this.position.y + this.height,
          0
        ), // 右下角
        new Point3(this.position.x, this.position.y + this.height, 0), // 左下角
      ];
      return new Bounds(
        this.position.x,
        this.position.y,
        this.width,
        this.height
      );
    } else {
      return new Bounds(0, 0, this.width || 0, this.height || 0);
    }
  }

  /**
   * 获取选项
   */
  getOptions(): TextOptions {
    return this.options;
  }

  /**
   * 设置选项
   */
  setOptions(options: TextOptions): TextElement {
    this.options = options;
    // 重新计算尺寸，因为字体选项可能已改变
    this.calculateActualDimensions();
    return this;
  }

  /**
   * 获取文字内容
   */
  getContent(): string {
    return this.content;
  }

  /**
   * 设置文字内容
   */
  setContent(content: string): TextElement {
    if (content.length > 1)
      throw new Error("TextElement content must be a single character");
    this.content = content;
    // 重新计算尺寸，因为文字内容已改变
    this.calculateActualDimensions();
    return this;
  }

  /**
   * 获取位置
   */
  getPosition(): Point3 {
    return this.position;
  }

  /**
   * 布局方法 - 在TextView中调用时设置位置和计算包围盒
   */
  public layout(position: Point3): TextElement {
    this.position = position;
    this.isLayouted = true;

    // 计算包围盒并设置正确的controlPoints
    this.setBounds(this.calculateBounds());
    return this;
  }

  public renderPath(ctx: CanvasRenderingContext2D, dependent: Boolean): void {
    dependent && ctx.beginPath();
    ctx.moveTo(this.controlPoints[0].x, this.controlPoints[1].y);
    for (let i = 1; i < this.controlPoints.length; i++) {
      ctx.lineTo(this.controlPoints[i].x, this.controlPoints[i].y);
    }
  }

  /**
   * 渲染文字元素
   */
  public render(ctx: CanvasRenderingContext2D): void {
    ctx.save()
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
    ctx.fillText(this.content, this.position.x, this.position.y);
    ctx.restore()
  }

  /**
   * 复制文字元素
   */
  public copy(): TextElement {
    const newElement = new TextElement(
      this.content,
      this.options.copy(),
      this.style.copy()
    );

    // 如果原对象已经布局，则设置position
    if (this.isLayouted) {
      newElement.position = this.position.copy();
      newElement.isLayouted = true;
      newElement.setBounds(newElement.calculateBounds());
    }

    return newElement;
  }

  /**
   * 检查是否是文字元素
   */
  public isTextElement(): boolean {
    return true;
  }

  /**
   * 获取文字的实际宽度（返回缓存的宽度）
   */
  public getActualWidth(): number {
    return this.width;
  }

  /**
   * 获取文字的实际高度（返回缓存的高度）
   */
  public getActualHeight(): number {
    return this.height;
  }

  /**
   * 静态工厂方法 - 创建简单文字元素
   */
  static simple(
    content: string,
    size: number = 16,
    color: string = "#000000"
  ): TextElement {
    const options = new TextOptions();
    options.setSize(size);
    // 从字符串创建Color对象
    const colorObj = Color.fromHex(color);
    options.setColor(colorObj);

    return new TextElement(content, options);
  }

  /**
   * 静态工厂方法 - 创建标题文字元素
   */
  static title(content: string, size: number = 24): TextElement {
    const options = TextOptions.title();
    options.setSize(size);

    return new TextElement(content, options);
  }

  /**
   * 静态工厂方法 - 创建粗体文字元素
   */
  static bold(content: string, size: number = 16): TextElement {
    const options = TextOptions.bold();
    options.setSize(size);

    return new TextElement(content, options);
  }

  /**
   * 静态工厂方法 - 创建斜体文字元素
   */
  static italic(content: string, size: number = 16): TextElement {
    const options = TextOptions.italic();
    options.setSize(size);

    return new TextElement(content, options);
  }
}
