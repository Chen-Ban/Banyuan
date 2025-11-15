import { GRAPHTYPE } from "@/core/constants";
import MediaElement from "./MediaElement";
import { Point3 } from "@/core/math";
import { Style } from "@/core/style";
import Bounds from "../base/Bounds";

/**
 * ImageElement 类 - 图片元素
 * 继承自 MediaElement，用于在画布中绘制图片
 */
export default class ImageElement extends MediaElement {
  public type: GRAPHTYPE = GRAPHTYPE.IMAGE;

  // 图片相关属性
  public image: HTMLImageElement | null = null;
  public imageSrc: string = "";

  constructor(x: number, y: number, imageSrc: string, style: Style = Style.DEFAULT) {
    super(x, y, style);
    this.imageSrc = imageSrc;

    // 异步加载图片
    this.loadImage();
  }

  /**
   * 计算图片元素的包围盒
   */
  public calculateBounds(): Bounds {
    if (!this.image || !this.loaded) {
      return new Bounds(this.x, this.y, 0, 0);
    }

    return new Bounds(this.x, this.y, this.image.naturalWidth, this.image.naturalHeight);
  }

  /**
   * 加载图片
   */
  protected async loadMedia(): Promise<void> {
    return this.loadImage();
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
        // 媒体加载完成后，更新控制点和边界框
        this.updateControlPoints();
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
    this.image = null;
    this.loaded = false;
    // 重置为未加载状态时，更新控制点和边界框
    this.updateControlPoints();
    this.loadImage();
    return this;
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

    // 使用设置的尺寸绘制图片，而不是原始尺寸
    ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
    ctx.restore();
  }

  /**
   * 渲染占位符（当图片未加载时）
   */
  protected renderPlaceholder(ctx: CanvasRenderingContext2D): void {
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
