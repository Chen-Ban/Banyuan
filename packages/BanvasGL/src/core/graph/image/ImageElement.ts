import { GRAPHTYPE } from "@/core/constants";
import Graph from "../base/Graph";
import { Point3 } from "@/core/math";
import { Style } from "@/core/style";
import Bounds from "../base/Bounds";

/**
 * ImageElement 类 - 图片元素
 * 继承自 Graph，用于在画布中绘制图片
 */
export default class ImageElement extends Graph {
  public type: GRAPHTYPE = GRAPHTYPE.IMAGE;
  public controlPoints: Point3[];
  public style: Style;

  // 图片相关属性
  public image: HTMLImageElement | null = null;
  public imageSrc: string = "";
  public x: number;
  public y: number;
  public width: number = 100;
  public height: number = 100;
  public opacity: number = 1; // 透明度
  public loaded: boolean = false;

  constructor(x: number, y: number, imageSrc: string, style: Style = Style.DEFAULT) {
    super();
    this.x = x;
    this.y = y;
    this.imageSrc = imageSrc;
    this.style = style;

    // 初始化控制点（裁剪区域的八个点）
    this.controlPoints = this.calculateCropControlPoints();

    // 在构造函数中立即计算边界框，确保View能获取到正确的初始尺寸
    this.setBounds(this.calculateBounds());

    // 异步加载图片
    this.loadImage();
  }

  /**
   * 计算图片元素的包围盒
   */
  protected calculateBounds(): Bounds {
    if (!this.image || !this.loaded) {
      return new Bounds(this.x, this.y, 0, 0);
    }

    return new Bounds(this.x, this.y, this.image.naturalWidth, this.image.naturalHeight);
  }

  /**
   * 加载图片
   */
  private async loadImage(): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous"; // 支持跨域图片

      img.onload = () => {
        this.image = img;
        this.width = img.naturalWidth;
        this.height = img.naturalHeight;
        this.loaded = true;
        resolve();
      };

      img.onerror = () => {
        console.error(`Failed to load image: ${this.imageSrc}`);
        reject(new Error(`Failed to load image: ${this.imageSrc}`));
      };

      img.src = this.imageSrc;
    });
  }

  /**
   * 设置图片源
   */
  setImageSrc(src: string): ImageElement {
    this.imageSrc = src;
    this.loaded = false;
    this.loadImage();
    return this;
  }

  /**
   * 设置位置
   */
  setPosition(x: number, y: number): ImageElement {
    this.x = x;
    this.y = y;
    this.updateControlPoints();
    return this;
  }

  setSize(width: number, height: number): ImageElement {
    this.width = width;
    this.height = height;
    this.updateControlPoints();
    return this;
  }

  /**
   * 设置透明度
   */
  setOpacity(opacity: number): ImageElement {
    this.opacity = Math.max(0, Math.min(1, opacity));
    return this;
  }

  isPointOnCurve(point: Point3, tolerance: number): boolean {
    return false;
  }
  /**
   * 计算裁剪区域的控制点（八个点）
   */
  private calculateCropControlPoints(): Point3[] {
    if (!this.image || !this.loaded) {
      // 如果图片未加载，返回默认控制点
      return [new Point3(this.x, this.y, 0)];
    }
    const actualX = this.x;
    const actualY = this.y;
    const actualWidth = this.width;
    const actualHeight = this.height;
    // 返回裁剪区域的八个控制点
    return [
      new Point3(actualX, actualY, 0), // 左上角
      new Point3(actualX + actualWidth / 2, actualY, 0), // 上中
      new Point3(actualX + actualWidth, actualY, 0), // 右上角
      new Point3(actualX + actualWidth, actualY + actualHeight / 2, 0), // 右中
      new Point3(actualX + actualWidth, actualY + actualHeight, 0), // 右下角
      new Point3(actualX + actualWidth / 2, actualY + actualHeight, 0), // 下中
      new Point3(actualX, actualY + actualHeight, 0), // 左下角
      new Point3(actualX, actualY + actualHeight / 2, 0), // 左中
    ];
  }

  /**
   * 更新控制点
   */
  private updateControlPoints(): void {
    this.controlPoints = this.calculateCropControlPoints();
  }

  public renderPath(ctx: CanvasRenderingContext2D, dependent: Boolean): void {
    dependent && ctx.beginPath();
    const x = this.x;
    const y = this.y;
    const width = this.width;
    const height = this.height;
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x, y + height);
    ctx.lineTo(x, y);
  }

  /**
   * 渲染图片
   */
  public render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    if (!this.image || !this.loaded) {
      // 如果图片未加载，绘制占位符
      this.renderPlaceholder(ctx);
      return;
    }

    // 应用样式
    const bounds = this.getBounds();
    this.style.applyToContext(ctx, bounds.width, bounds.height);

    // 设置透明度
    ctx.globalAlpha = this.opacity;

    ctx.drawImage(this.image, this.x, this.y, this.image.naturalWidth, this.image.naturalHeight);
    ctx.restore();
  }

  /**
   * 渲染占位符（当图片未加载时）
   */
  private renderPlaceholder(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = "#cccccc";
    ctx.lineWidth = 1;
    ctx.strokeRect(this.x, this.y, this.width, this.height);

    // 绘制加载中文字
    ctx.fillStyle = "#999999";
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Loading...", this.x + this.width / 2, this.y + this.height / 2);
  }

  /**
   * 获取图片的像素数据
   */
  getImageData(): ImageData | null {
    if (!this.image || !this.loaded) return null;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    canvas.width = this.image.naturalWidth;
    canvas.height = this.image.naturalHeight;

    ctx.drawImage(this.image, 0, 0, this.image.naturalWidth, this.image.naturalHeight);

    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  /**
   * 复制图片元素
   */
  public copy(): this {
    const copy = new ImageElement(this.x, this.y, this.imageSrc, this.style);
    copy.opacity = this.opacity;
    return copy as this;
  }

  /**
   * 静态工厂方法
   */
  static fromImageElement(image: HTMLImageElement, x: number, y: number, style: Style = Style.DEFAULT): ImageElement {
    const element = new ImageElement(x, y, "", style);
    element.image = image;
    element.loaded = true;
    return element;
  }

  static fromCanvas(canvas: HTMLCanvasElement, x: number, y: number, style: Style = Style.DEFAULT): ImageElement {
    const element = new ImageElement(x, y, "", style);
    // 将 canvas 转换为图片
    const img = new Image();
    img.src = canvas.toDataURL();
    element.image = img;
    element.loaded = true;
    return element;
  }
}
