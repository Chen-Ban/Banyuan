/**
 * 平台无关的 2D 绘图上下文接口
 *
 * 覆盖 CanvasRenderingContext2D 中被 banvasgl 实际使用的子集。
 * 不同平台（Web Canvas / Skia / CanvasKit / node-canvas）各自适配。
 *
 * 设计原则：
 *   - 与 CanvasRenderingContext2D API 保持 1:1 语义映射，降低心智负担
 *   - 仅包含 banvasgl 内部实际调用的方法/属性
 *   - 渐变/图案/图像源同样以接口抽象，避免 DOM 类型泄漏
 */

// ── 平台无关的 Canvas 枚举类型（替代 lib.dom 中的对应类型） ──

/** 填充规则 */
export type DrawingFillRule = 'nonzero' | 'evenodd';

/** 线段端点样式 */
export type DrawingLineCap = 'butt' | 'round' | 'square';

/** 线段连接样式 */
export type DrawingLineJoin = 'round' | 'bevel' | 'miter';

/** 文本对齐 */
export type DrawingTextAlign = 'start' | 'end' | 'left' | 'right' | 'center';

/** 文本基线 */
export type DrawingTextBaseline =
  | 'top'
  | 'hanging'
  | 'middle'
  | 'alphabetic'
  | 'ideographic'
  | 'bottom';

/** 图像平滑质量 */
export type DrawingImageSmoothingQuality = 'low' | 'medium' | 'high';

/** DOMMatrix2DInit 等价类型 */
export interface DrawingMatrix2DInit {
  a?: number;
  b?: number;
  c?: number;
  d?: number;
  e?: number;
  f?: number;
  m11?: number;
  m12?: number;
  m21?: number;
  m22?: number;
  m41?: number;
  m42?: number;
}

// ── 辅助接口 ──

/** 渐变接口（平台无关） */
export interface IDrawingGradient {
  addColorStop(offset: number, color: string): void;
}

/** 图案接口（平台无关） */
export interface IDrawingPattern {
  setTransform(matrix?: DrawingMatrix2DInit): void;
}

/** 图像源（平台无关） */
export interface IDrawingImageSource {
  readonly width: number;
  readonly height: number;
}

/**
 * 视频源（平台无关）
 *
 * 引擎视角下，视频 = 带时间维度的像素帧序列。
 * 平台适配器（如 WebDrawingVideoSource）负责封装底层播放器（HTMLVideoElement / ffmpeg 等），
 * 引擎只通过此接口控制播放和获取当前帧像素尺寸。
 */
export interface IDrawingVideoSource extends IDrawingImageSource {
  /** 播放视频 */
  play(): Promise<void>;
  /** 暂停视频 */
  pause(): void;
  /** 停止视频（暂停 + 回到起始位置） */
  stop(): void;
  /** 当前是否正在播放 */
  readonly playing: boolean;
  /** 当前播放时间（秒），可读写 */
  currentTime: number;
  /** 视频总时长（秒），只读 */
  readonly duration: number;
  /** 音量（0-1），可读写 */
  volume: number;
  /** 是否自动播放 */
  autoplay: boolean;
  /** 是否循环播放 */
  loop: boolean;
  /** 是否静音 */
  muted: boolean;
  /**
   * 批量设置播放选项。
   * 只更新传入的字段，未传入的保持不变。
   */
  setPlayOptions(options: IDrawingVideoLoadOptions): void;
}

/** 视频加载选项 */
export interface IDrawingVideoLoadOptions {
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  /** 跨域模式，Web 平台对应 HTMLVideoElement.crossOrigin */
  crossOrigin?: string;
}

/** 文字度量 */
export interface IDrawingTextMetrics {
  readonly width: number;
  readonly actualBoundingBoxAscent?: number;
  readonly actualBoundingBoxDescent?: number;
  readonly fontBoundingBoxAscent?: number;
  readonly fontBoundingBoxDescent?: number;
}

/** 像素数据 */
export interface IDrawingImageData {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

// ── 绘图上下文接口 ──

/**
 * 平台无关的 2D 绘图上下文
 *
 * 覆盖了 CanvasRenderingContext2D 中 banvasgl 实际使用的全部 API。
 * 平台适配器（如 WebDrawingContext）负责将调用委托给真实的 CanvasRenderingContext2D。
 */
export interface IDrawingContext {
  // ── 状态管理 ──
  save(): void;
  restore(): void;

  // ── 变换矩阵 ──
  setTransform(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ): void;
  transform(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  rotate(angle: number): void;

  // ── 全局合成 ──
  globalAlpha: number;
  globalCompositeOperation: string;

  // ── 路径 ──
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    counterclockwise?: boolean,
  ): void;
  arcTo(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    radius: number,
  ): void;
  bezierCurveTo(
    cp1x: number,
    cp1y: number,
    cp2x: number,
    cp2y: number,
    x: number,
    y: number,
  ): void;
  quadraticCurveTo(
    cpx: number,
    cpy: number,
    x: number,
    y: number,
  ): void;
  ellipse(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
    startAngle: number,
    endAngle: number,
    counterclockwise?: boolean,
  ): void;
  rect(x: number, y: number, w: number, h: number): void;
  roundRect(
    x: number,
    y: number,
    w: number,
    h: number,
    radii?: number | number[],
  ): void;

  // ── 填充与描边 ──
  fill(fillRule?: DrawingFillRule): void;
  stroke(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  clip(fillRule?: DrawingFillRule): void;

  // ── 样式属性 ──
  fillStyle: string | IDrawingGradient | IDrawingPattern;
  strokeStyle: string | IDrawingGradient | IDrawingPattern;
  lineWidth: number;
  lineCap: DrawingLineCap;
  lineJoin: DrawingLineJoin;
  miterLimit: number;
  lineDashOffset: number;
  setLineDash(segments: number[]): void;
  getLineDash(): number[];

  // ── 阴影 ──
  shadowBlur: number;
  shadowColor: string;
  shadowOffsetX: number;
  shadowOffsetY: number;

  // ── 渐变与图案 ──
  createLinearGradient(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): IDrawingGradient;
  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number,
  ): IDrawingGradient;
  createConicGradient(
    startAngle: number,
    x: number,
    y: number,
  ): IDrawingGradient;
  createPattern(
    image: IDrawingImageSource,
    repetition: string | null,
  ): IDrawingPattern | null;

  // ── 图像 ──
  drawImage(image: IDrawingImageSource, dx: number, dy: number): void;
  drawImage(
    image: IDrawingImageSource,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
  drawImage(
    image: IDrawingImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;

  // ── 图像平滑 ──
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: DrawingImageSmoothingQuality;

  // ── 文字 ──
  font: string;
  textAlign: DrawingTextAlign;
  textBaseline: DrawingTextBaseline;
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
  strokeText(text: string, x: number, y: number, maxWidth?: number): void;
  measureText(text: string): IDrawingTextMetrics;

  // ── 像素操作 ──
  getImageData(
    sx: number,
    sy: number,
    sw: number,
    sh: number,
  ): IDrawingImageData;
  putImageData(
    imagedata: IDrawingImageData,
    dx: number,
    dy: number,
  ): void;
  createImageData(sw: number, sh: number): IDrawingImageData;

  // ── 命中测试 ──
  isPointInPath(x: number, y: number, fillRule?: DrawingFillRule): boolean;
  isPointInStroke(x: number, y: number): boolean;

  // ── 平台媒体源创建（替代引擎内直接 new Image() / document.createElement） ──

  /**
   * 从 URL 加载图像源。
   * 平台负责创建像素源（如 Web 的 HTMLImageElement），引擎只拿到 IDrawingImageSource。
   */
  loadImageSource(src: string, crossOrigin?: string): Promise<IDrawingImageSource>;

  /**
   * 从 URL 加载视频源。
   * 平台负责创建视频像素源（如 Web 的 HTMLVideoElement），引擎只拿到 IDrawingVideoSource。
   */
  loadVideoSource(
    src: string,
    options?: IDrawingVideoLoadOptions,
  ): Promise<IDrawingVideoSource>;

  /**
   * 从图像/视频源提取像素数据。
   * 封装"临时画布 → drawImage → getImageData"的平台实现细节。
   */
  extractImageData(
    source: IDrawingImageSource,
    width: number,
    height: number,
  ): IDrawingImageData | null;
}
