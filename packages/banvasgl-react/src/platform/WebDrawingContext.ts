/**
 * WebDrawingContext — IDrawingContext 的 Web Canvas 实现
 *
 * 将真实的 CanvasRenderingContext2D 包装为平台无关的 IDrawingContext。
 * 渐变/图案/图像源也在 Web 层面实现对应的 IDrawingGradient/IDrawingPattern/IDrawingImageSource。
 */

import type {
  IDrawingContext,
  IDrawingGradient,
  IDrawingPattern,
  IDrawingImageSource,
  IDrawingTextMetrics,
  IDrawingImageData,
} from "@banyuan/banvasgl";

// ── Web 渐变适配器 ──

class WebGradient implements IDrawingGradient {
  constructor(private gradient: CanvasGradient) {}
  addColorStop(offset: number, color: string): void {
    this.gradient.addColorStop(offset, color);
  }
}

// ── Web 图案适配器 ──

class WebPattern implements IDrawingPattern {
  constructor(private pattern: CanvasPattern) {}
  setTransform(matrix?: DOMMatrix2DInit): void {
    this.pattern.setTransform(matrix);
  }
}

// ── Web 图像数据适配器 ──

class WebImageData implements IDrawingImageData {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
  private _imageData: ImageData;
  constructor(imageData: ImageData) {
    this._imageData = imageData;
    this.width = imageData.width;
    this.height = imageData.height;
    this.data = imageData.data;
  }
  /** 获取底层 ImageData（用于 putImageData 等平台操作） */
  get imageData(): ImageData { return this._imageData; }
}

// ── 辅助：解包／包装 ──

function unwrapStyle(
  value: string | IDrawingGradient | IDrawingPattern,
): string | CanvasGradient | CanvasPattern {
  if (value instanceof WebGradient) return (value as unknown as { gradient: CanvasGradient }).gradient;
  if (value instanceof WebPattern) return (value as unknown as { pattern: CanvasPattern }).pattern;
  return value as string;
}

function wrapGradient(g: CanvasGradient): IDrawingGradient {
  return new WebGradient(g);
}

function wrapPattern(p: CanvasPattern): IDrawingPattern | null {
  return p ? new WebPattern(p) : null;
}

// ── WebDrawingContext ──

/**
 * WebDrawingContext 将 CanvasRenderingContext2D 适配为 IDrawingContext。
 *
 * 每个 WebDrawingContext 实例绑定一个真实的 CanvasRenderingContext2D，
 * 所有方法直接委托给底层上下文。
 */
export class WebDrawingContext implements IDrawingContext {
  /**
   * @param ctx 底层的 CanvasRenderingContext2D
   */
  constructor(public readonly ctx: CanvasRenderingContext2D) {}

  // ── 状态管理 ──
  save(): void { this.ctx.save(); }
  restore(): void { this.ctx.restore(); }

  // ── 变换矩阵 ──
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.ctx.setTransform(a, b, c, d, e, f);
  }
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.ctx.transform(a, b, c, d, e, f);
  }
  translate(x: number, y: number): void { this.ctx.translate(x, y); }
  scale(x: number, y: number): void { this.ctx.scale(x, y); }
  rotate(angle: number): void { this.ctx.rotate(angle); }

  // ── 全局合成 ──
  get globalAlpha(): number { return this.ctx.globalAlpha; }
  set globalAlpha(v: number) { this.ctx.globalAlpha = v; }
  get globalCompositeOperation(): string { return this.ctx.globalCompositeOperation; }
  set globalCompositeOperation(v: string) { this.ctx.globalCompositeOperation = v as GlobalCompositeOperation; }

  // ── 路径 ──
  beginPath(): void { this.ctx.beginPath(); }
  closePath(): void { this.ctx.closePath(); }
  moveTo(x: number, y: number): void { this.ctx.moveTo(x, y); }
  lineTo(x: number, y: number): void { this.ctx.lineTo(x, y); }
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void {
    this.ctx.arc(x, y, radius, startAngle, endAngle, counterclockwise);
  }
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void {
    this.ctx.arcTo(x1, y1, x2, y2, radius);
  }
  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void {
    this.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
  }
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void {
    this.ctx.quadraticCurveTo(cpx, cpy, x, y);
  }
  ellipse(x: number, y: number, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void {
    this.ctx.ellipse(x, y, radiusX, radiusY, rotation, startAngle, endAngle, counterclockwise);
  }
  rect(x: number, y: number, w: number, h: number): void { this.ctx.rect(x, y, w, h); }
  roundRect(x: number, y: number, w: number, h: number, radii?: number | number[]): void {
    if (this.ctx.roundRect) {
      this.ctx.roundRect(x, y, w, h, radii);
    }
  }

  // ── 填充与描边 ──
  fill(fillRule?: CanvasFillRule): void { this.ctx.fill(fillRule); }
  stroke(): void { this.ctx.stroke(); }
  fillRect(x: number, y: number, w: number, h: number): void { this.ctx.fillRect(x, y, w, h); }
  strokeRect(x: number, y: number, w: number, h: number): void { this.ctx.strokeRect(x, y, w, h); }
  clearRect(x: number, y: number, w: number, h: number): void { this.ctx.clearRect(x, y, w, h); }
  clip(fillRule?: CanvasFillRule): void { this.ctx.clip(fillRule); }

  // ── 样式属性 ──
  get fillStyle(): string | IDrawingGradient | IDrawingPattern {
    const v = this.ctx.fillStyle;
    if (v instanceof CanvasGradient) return wrapGradient(v);
    if (v instanceof CanvasPattern) return wrapPattern(v)!;
    return v as string;
  }
  set fillStyle(v: string | IDrawingGradient | IDrawingPattern) {
    this.ctx.fillStyle = unwrapStyle(v);
  }
  get strokeStyle(): string | IDrawingGradient | IDrawingPattern {
    const v = this.ctx.strokeStyle;
    if (v instanceof CanvasGradient) return wrapGradient(v);
    if (v instanceof CanvasPattern) return wrapPattern(v)!;
    return v as string;
  }
  set strokeStyle(v: string | IDrawingGradient | IDrawingPattern) {
    this.ctx.strokeStyle = unwrapStyle(v);
  }
  get lineWidth(): number { return this.ctx.lineWidth; }
  set lineWidth(v: number) { this.ctx.lineWidth = v; }
  get lineCap(): CanvasLineCap { return this.ctx.lineCap; }
  set lineCap(v: CanvasLineCap) { this.ctx.lineCap = v; }
  get lineJoin(): CanvasLineJoin { return this.ctx.lineJoin; }
  set lineJoin(v: CanvasLineJoin) { this.ctx.lineJoin = v; }
  get miterLimit(): number { return this.ctx.miterLimit; }
  set miterLimit(v: number) { this.ctx.miterLimit = v; }
  get lineDashOffset(): number { return this.ctx.lineDashOffset; }
  set lineDashOffset(v: number) { this.ctx.lineDashOffset = v; }
  setLineDash(segments: number[]): void { this.ctx.setLineDash(segments); }
  getLineDash(): number[] { return this.ctx.getLineDash(); }

  // ── 阴影 ──
  get shadowBlur(): number { return this.ctx.shadowBlur; }
  set shadowBlur(v: number) { this.ctx.shadowBlur = v; }
  get shadowColor(): string { return this.ctx.shadowColor; }
  set shadowColor(v: string) { this.ctx.shadowColor = v; }
  get shadowOffsetX(): number { return this.ctx.shadowOffsetX; }
  set shadowOffsetX(v: number) { this.ctx.shadowOffsetX = v; }
  get shadowOffsetY(): number { return this.ctx.shadowOffsetY; }
  set shadowOffsetY(v: number) { this.ctx.shadowOffsetY = v; }

  // ── 渐变与图案 ──
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): IDrawingGradient {
    return wrapGradient(this.ctx.createLinearGradient(x0, y0, x1, y1));
  }
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): IDrawingGradient {
    return wrapGradient(this.ctx.createRadialGradient(x0, y0, r0, x1, y1, r1));
  }
  createConicGradient(startAngle: number, x: number, y: number): IDrawingGradient {
    return wrapGradient(this.ctx.createConicGradient(startAngle, x, y));
  }
  createPattern(image: IDrawingImageSource, repetition: string | null): IDrawingPattern | null {
    if (
      image instanceof HTMLImageElement ||
      image instanceof HTMLCanvasElement ||
      image instanceof HTMLVideoElement ||
      image instanceof ImageBitmap
    ) {
      const pattern = this.ctx.createPattern(image, repetition);
      return pattern ? wrapPattern(pattern) : null;
    }
    return null;
  }

  // ── 图像 ──
  drawImage(image: IDrawingImageSource, dx: number, dy: number): void;
  drawImage(image: IDrawingImageSource, dx: number, dy: number, dw: number, dh: number): void;
  drawImage(image: IDrawingImageSource, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;
  drawImage(
    image: IDrawingImageSource,
    ...args: number[]
  ): void {
    const img = image as unknown as CanvasImageSource;
    if (args.length === 2) {
      this.ctx.drawImage(img, args[0], args[1]);
    } else if (args.length === 4) {
      this.ctx.drawImage(img, args[0], args[1], args[2], args[3]);
    } else if (args.length === 8) {
      this.ctx.drawImage(img, args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7]);
    }
  }

  // ── 图像平滑 ──
  get imageSmoothingEnabled(): boolean { return this.ctx.imageSmoothingEnabled; }
  set imageSmoothingEnabled(v: boolean) { this.ctx.imageSmoothingEnabled = v; }
  get imageSmoothingQuality(): ImageSmoothingQuality { return this.ctx.imageSmoothingQuality; }
  set imageSmoothingQuality(v: ImageSmoothingQuality) { this.ctx.imageSmoothingQuality = v; }

  // ── 文字 ──
  get font(): string { return this.ctx.font; }
  set font(v: string) { this.ctx.font = v; }
  get textAlign(): CanvasTextAlign { return this.ctx.textAlign; }
  set textAlign(v: CanvasTextAlign) { this.ctx.textAlign = v; }
  get textBaseline(): CanvasTextBaseline { return this.ctx.textBaseline; }
  set textBaseline(v: CanvasTextBaseline) { this.ctx.textBaseline = v; }
  fillText(text: string, x: number, y: number, maxWidth?: number): void {
    this.ctx.fillText(text, x, y, maxWidth);
  }
  strokeText(text: string, x: number, y: number, maxWidth?: number): void {
    this.ctx.strokeText(text, x, y, maxWidth);
  }
  measureText(text: string): IDrawingTextMetrics {
    return this.ctx.measureText(text);
  }

  // ── 像素操作 ──
  getImageData(sx: number, sy: number, sw: number, sh: number): IDrawingImageData {
    return new WebImageData(this.ctx.getImageData(sx, sy, sw, sh));
  }
  putImageData(imagedata: IDrawingImageData, dx: number, dy: number): void {
    if (imagedata instanceof WebImageData) {
      this.ctx.putImageData(imagedata.imageData, dx, dy);
    }
  }
  createImageData(sw: number, sh: number): IDrawingImageData {
    return new WebImageData(this.ctx.createImageData(sw, sh));
  }

  // ── 命中测试 ──
  isPointInPath(x: number, y: number, fillRule?: CanvasFillRule): boolean {
    return this.ctx.isPointInPath(x, y, fillRule);
  }
  isPointInStroke(x: number, y: number): boolean {
    return this.ctx.isPointInStroke(x, y);
  }
}
