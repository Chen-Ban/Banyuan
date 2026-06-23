/**
 * WebDrawingContext — IDrawingContext 的 Web 平台实现
 *
 * 将 CanvasRenderingContext2D 适配为平台无关的 IDrawingContext 接口。
 * 包含渐变/图案/视频源的包装类，封装 DOM 细节于适配器内部。
 */

import type {
  IDrawingContext,
  IDrawingGradient,
  IDrawingPattern,
  IDrawingImageSource,
  IDrawingVideoSource,
  IDrawingTextMetrics,
  IDrawingImageData,
  IDrawingVideoLoadOptions,
  DrawingFillRule,
  DrawingLineCap,
  DrawingLineJoin,
  DrawingTextAlign,
  DrawingTextBaseline,
  DrawingImageSmoothingQuality,
  DrawingMatrix2DInit,
} from '@banyuan/banvasgl';

// ── WebDrawingGradient ──────────────────────────────────────────

class WebDrawingGradient implements IDrawingGradient {
  readonly native: CanvasGradient;

  constructor(gradient: CanvasGradient) {
    this.native = gradient;
  }

  addColorStop(offset: number, color: string): void {
    this.native.addColorStop(offset, color);
  }
}

// ── WebDrawingPattern ───────────────────────────────────────────

class WebDrawingPattern implements IDrawingPattern {
  readonly native: CanvasPattern;

  constructor(pattern: CanvasPattern) {
    this.native = pattern;
  }

  setTransform(matrix?: DrawingMatrix2DInit): void {
    if (matrix) {
      this.native.setTransform(matrix as DOMMatrix2DInit);
    }
  }
}

// ── WebDrawingVideoSource ───────────────────────────────────────

class WebDrawingVideoSource implements IDrawingVideoSource {
  readonly native: HTMLVideoElement;

  constructor(video: HTMLVideoElement) {
    this.native = video;
  }

  get width(): number {
    return this.native.videoWidth;
  }

  get height(): number {
    return this.native.videoHeight;
  }

  play(): Promise<void> {
    return this.native.play();
  }

  pause(): void {
    this.native.pause();
  }

  stop(): void {
    this.native.pause();
    this.native.currentTime = 0;
  }

  get playing(): boolean {
    return !this.native.paused && !this.native.ended;
  }

  get currentTime(): number {
    return this.native.currentTime;
  }

  set currentTime(value: number) {
    this.native.currentTime = value;
  }

  get duration(): number {
    return this.native.duration;
  }

  get volume(): number {
    return this.native.volume;
  }

  set volume(value: number) {
    this.native.volume = Math.max(0, Math.min(1, value));
  }

  get autoplay(): boolean {
    return this.native.autoplay;
  }

  set autoplay(value: boolean) {
    this.native.autoplay = value;
  }

  get loop(): boolean {
    return this.native.loop;
  }

  set loop(value: boolean) {
    this.native.loop = value;
  }

  get muted(): boolean {
    return this.native.muted;
  }

  set muted(value: boolean) {
    this.native.muted = value;
  }

  setPlayOptions(options: IDrawingVideoLoadOptions): void {
    if (options.autoplay !== undefined) this.native.autoplay = options.autoplay;
    if (options.loop !== undefined) this.native.loop = options.loop;
    if (options.muted !== undefined) this.native.muted = options.muted;
  }
}

// ── 解包辅助函数 ────────────────────────────────────────────────

/** 将 fillStyle/strokeStyle 值解包为 Canvas 2D 可接受的类型 */
function unwrapStyle(
  value: string | IDrawingGradient | IDrawingPattern,
): string | CanvasGradient | CanvasPattern {
  if (typeof value === 'string') return value;
  if (value instanceof WebDrawingGradient) return value.native;
  if (value instanceof WebDrawingPattern) return value.native;
  // 兜底：未知类型直接返回（理论上不会走到这里）
  return value as unknown as string;
}

/** 将图像源解包为 Canvas 可接受的类型 */
function unwrapImageSource(
  source: IDrawingImageSource,
): CanvasImageSource {
  if (source instanceof WebDrawingVideoSource) return source.native;
  // HTMLImageElement / ImageBitmap / HTMLCanvasElement 等本身即是 CanvasImageSource
  return source as unknown as CanvasImageSource;
}

// ── WebDrawingContext ───────────────────────────────────────────

export class WebDrawingContext implements IDrawingContext {
  private _ctx: CanvasRenderingContext2D;

  constructor(ctx: CanvasRenderingContext2D) {
    this._ctx = ctx;
  }

  // ── 状态管理 ──

  save(): void {
    this._ctx.save();
  }

  restore(): void {
    this._ctx.restore();
  }

  // ── 变换矩阵 ──

  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this._ctx.setTransform(a, b, c, d, e, f);
  }

  transform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this._ctx.transform(a, b, c, d, e, f);
  }

  translate(x: number, y: number): void {
    this._ctx.translate(x, y);
  }

  scale(x: number, y: number): void {
    this._ctx.scale(x, y);
  }

  rotate(angle: number): void {
    this._ctx.rotate(angle);
  }

  // ── 全局合成 ──

  get globalAlpha(): number {
    return this._ctx.globalAlpha;
  }

  set globalAlpha(value: number) {
    this._ctx.globalAlpha = value;
  }

  get globalCompositeOperation(): string {
    return this._ctx.globalCompositeOperation;
  }

  set globalCompositeOperation(value: string) {
    this._ctx.globalCompositeOperation = value as GlobalCompositeOperation;
  }

  // ── 路径 ──

  beginPath(): void {
    this._ctx.beginPath();
  }

  closePath(): void {
    this._ctx.closePath();
  }

  moveTo(x: number, y: number): void {
    this._ctx.moveTo(x, y);
  }

  lineTo(x: number, y: number): void {
    this._ctx.lineTo(x, y);
  }

  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void {
    this._ctx.arc(x, y, radius, startAngle, endAngle, counterclockwise);
  }

  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void {
    this._ctx.arcTo(x1, y1, x2, y2, radius);
  }

  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void {
    this._ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
  }

  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void {
    this._ctx.quadraticCurveTo(cpx, cpy, x, y);
  }

  ellipse(x: number, y: number, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void {
    this._ctx.ellipse(x, y, radiusX, radiusY, rotation, startAngle, endAngle, counterclockwise);
  }

  rect(x: number, y: number, w: number, h: number): void {
    this._ctx.rect(x, y, w, h);
  }

  roundRect(x: number, y: number, w: number, h: number, radii?: number | number[]): void {
    if (radii !== undefined) {
      this._ctx.roundRect(x, y, w, h, radii);
    } else {
      this._ctx.roundRect(x, y, w, h);
    }
  }

  // ── 填充与描边 ──

  fill(fillRule?: DrawingFillRule): void {
    this._ctx.fill(fillRule);
  }

  stroke(): void {
    this._ctx.stroke();
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    this._ctx.fillRect(x, y, w, h);
  }

  strokeRect(x: number, y: number, w: number, h: number): void {
    this._ctx.strokeRect(x, y, w, h);
  }

  clearRect(x: number, y: number, w: number, h: number): void {
    this._ctx.clearRect(x, y, w, h);
  }

  clip(fillRule?: DrawingFillRule): void {
    this._ctx.clip(fillRule);
  }

  // ── 样式属性 ──

  get fillStyle(): string | IDrawingGradient | IDrawingPattern {
    return this._ctx.fillStyle as unknown as string | IDrawingGradient | IDrawingPattern;
  }

  set fillStyle(value: string | IDrawingGradient | IDrawingPattern) {
    this._ctx.fillStyle = unwrapStyle(value);
  }

  get strokeStyle(): string | IDrawingGradient | IDrawingPattern {
    return this._ctx.strokeStyle as unknown as string | IDrawingGradient | IDrawingPattern;
  }

  set strokeStyle(value: string | IDrawingGradient | IDrawingPattern) {
    this._ctx.strokeStyle = unwrapStyle(value);
  }

  get lineWidth(): number {
    return this._ctx.lineWidth;
  }

  set lineWidth(value: number) {
    this._ctx.lineWidth = value;
  }

  get lineCap(): DrawingLineCap {
    return this._ctx.lineCap as DrawingLineCap;
  }

  set lineCap(value: DrawingLineCap) {
    this._ctx.lineCap = value;
  }

  get lineJoin(): DrawingLineJoin {
    return this._ctx.lineJoin as DrawingLineJoin;
  }

  set lineJoin(value: DrawingLineJoin) {
    this._ctx.lineJoin = value;
  }

  get miterLimit(): number {
    return this._ctx.miterLimit;
  }

  set miterLimit(value: number) {
    this._ctx.miterLimit = value;
  }

  get lineDashOffset(): number {
    return this._ctx.lineDashOffset;
  }

  set lineDashOffset(value: number) {
    this._ctx.lineDashOffset = value;
  }

  setLineDash(segments: number[]): void {
    this._ctx.setLineDash(segments);
  }

  getLineDash(): number[] {
    return this._ctx.getLineDash();
  }

  // ── 阴影 ──

  get shadowBlur(): number {
    return this._ctx.shadowBlur;
  }

  set shadowBlur(value: number) {
    this._ctx.shadowBlur = value;
  }

  get shadowColor(): string {
    return this._ctx.shadowColor;
  }

  set shadowColor(value: string) {
    this._ctx.shadowColor = value;
  }

  get shadowOffsetX(): number {
    return this._ctx.shadowOffsetX;
  }

  set shadowOffsetX(value: number) {
    this._ctx.shadowOffsetX = value;
  }

  get shadowOffsetY(): number {
    return this._ctx.shadowOffsetY;
  }

  set shadowOffsetY(value: number) {
    this._ctx.shadowOffsetY = value;
  }

  // ── 渐变与图案 ──

  createLinearGradient(x0: number, y0: number, x1: number, y1: number): IDrawingGradient {
    return new WebDrawingGradient(this._ctx.createLinearGradient(x0, y0, x1, y1));
  }

  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): IDrawingGradient {
    return new WebDrawingGradient(this._ctx.createRadialGradient(x0, y0, r0, x1, y1, r1));
  }

  createConicGradient(startAngle: number, x: number, y: number): IDrawingGradient {
    return new WebDrawingGradient(this._ctx.createConicGradient(startAngle, x, y));
  }

  createPattern(image: IDrawingImageSource, repetition: string | null): IDrawingPattern | null {
    const nativeImg = unwrapImageSource(image);
    const pattern = this._ctx.createPattern(nativeImg, repetition ?? '');
    return pattern ? new WebDrawingPattern(pattern) : null;
  }

  // ── 图像 ──

  drawImage(image: IDrawingImageSource, dx: number, dy: number): void;
  drawImage(image: IDrawingImageSource, dx: number, dy: number, dw: number, dh: number): void;
  drawImage(image: IDrawingImageSource, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;
  drawImage(
    image: IDrawingImageSource,
    ...args: number[]
  ): void {
    const nativeImg = unwrapImageSource(image);
    (this._ctx.drawImage as Function)(nativeImg, ...args);
  }

  // ── 图像平滑 ──

  get imageSmoothingEnabled(): boolean {
    return this._ctx.imageSmoothingEnabled;
  }

  set imageSmoothingEnabled(value: boolean) {
    this._ctx.imageSmoothingEnabled = value;
  }

  get imageSmoothingQuality(): DrawingImageSmoothingQuality {
    return this._ctx.imageSmoothingQuality as DrawingImageSmoothingQuality;
  }

  set imageSmoothingQuality(value: DrawingImageSmoothingQuality) {
    this._ctx.imageSmoothingQuality = value;
  }

  // ── 文字 ──

  get font(): string {
    return this._ctx.font;
  }

  set font(value: string) {
    this._ctx.font = value;
  }

  get textAlign(): DrawingTextAlign {
    return this._ctx.textAlign as DrawingTextAlign;
  }

  set textAlign(value: DrawingTextAlign) {
    this._ctx.textAlign = value;
  }

  get textBaseline(): DrawingTextBaseline {
    return this._ctx.textBaseline as DrawingTextBaseline;
  }

  set textBaseline(value: DrawingTextBaseline) {
    this._ctx.textBaseline = value;
  }

  fillText(text: string, x: number, y: number, maxWidth?: number): void {
    this._ctx.fillText(text, x, y, maxWidth);
  }

  strokeText(text: string, x: number, y: number, maxWidth?: number): void {
    this._ctx.strokeText(text, x, y, maxWidth);
  }

  measureText(text: string): IDrawingTextMetrics {
    return this._ctx.measureText(text);
  }

  // ── 像素操作 ──

  getImageData(sx: number, sy: number, sw: number, sh: number): IDrawingImageData {
    return this._ctx.getImageData(sx, sy, sw, sh);
  }

  putImageData(imagedata: IDrawingImageData, dx: number, dy: number): void {
    this._ctx.putImageData(imagedata as ImageData, dx, dy);
  }

  createImageData(sw: number, sh: number): IDrawingImageData {
    return this._ctx.createImageData(sw, sh);
  }

  // ── 命中测试 ──

  isPointInPath(x: number, y: number, fillRule?: DrawingFillRule): boolean {
    return this._ctx.isPointInPath(x, y, fillRule);
  }

  isPointInStroke(x: number, y: number): boolean {
    return this._ctx.isPointInStroke(x, y);
  }

  // ── 平台媒体源创建 ──

  async loadImageSource(src: string, crossOrigin?: string): Promise<IDrawingImageSource> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      if (crossOrigin) {
        img.crossOrigin = crossOrigin;
      }
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      img.src = src;
    });
  }

  async loadVideoSource(src: string, options?: IDrawingVideoLoadOptions): Promise<IDrawingVideoSource> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.crossOrigin = options?.crossOrigin ?? 'anonymous';
      video.preload = 'metadata';

      if (options?.autoplay) video.autoplay = true;
      if (options?.loop) video.loop = true;
      if (options?.muted) video.muted = true;

      video.onloadedmetadata = () => resolve(new WebDrawingVideoSource(video));
      video.onerror = () => reject(new Error(`Failed to load video: ${src}`));
      video.src = src;
    });
  }

  extractImageData(source: IDrawingImageSource, width: number, height: number): IDrawingImageData | null {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    canvas.width = width;
    canvas.height = height;

    const nativeImg = unwrapImageSource(source);
    ctx.drawImage(nativeImg, 0, 0, width, height);

    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }
}

// ── 工厂函数 ──

export function createWebDrawingContext(
  ctx: CanvasRenderingContext2D,
): IDrawingContext {
  return new WebDrawingContext(ctx);
}
