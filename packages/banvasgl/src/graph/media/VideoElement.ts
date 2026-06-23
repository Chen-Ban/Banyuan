import { GraphType } from "@/foundation/constants";
import MediaElement from "./MediaElement";
import { Style } from "@/foundation/style";
import type { IVideoElement } from '@/types/graph/graph'
import type { ISerializable } from '@/types/foundation/serializable'
import type { IDrawingContext } from '@/types/platform/drawing.js'
import type { IVideoSource, IVideoLoadOptions, IImageSource } from '@/types/foundation/media.js'
import { generateId } from '@/foundation/utils';

/**
 * 视频元素类。
 *
 * VideoElement 继承自 {@link MediaElement}，实现 {@link IVideoElement} 和 {@link ISerializable} 接口，
 * 用于在画布中绘制视频内容。
 *
 * **播放控制**：提供 {@link play}、{@link pause}、{@link stop}、{@link setCurrentTime} 等方法，
 * 底层代理 `HTMLVideoElement` 的对应 API。
 *
 * **播放选项**：通过 {@link setPlayOptions} 统一设置 `autoplay`/`loop`/`muted` 选项，
 * 同时更新实例属性和底层 `HTMLVideoElement` 的属性。
 *
 * **像素提取**：{@link getImageData} 从当前播放帧提取 `ImageData`，
 * 通过临时 Canvas + `drawImage` + `getImageData` 实现。
 *
 * **跨域支持**：创建 `HTMLVideoElement` 时设置 `crossOrigin = 'anonymous'`。
 *
 * @extends MediaElement
 * @implements IVideoElement
 * @implements ISerializable
 *
 * @example
 * ```ts
 * const video = new VideoElement('https://cdn.example.com/clip.mp4', 10, 20, 640, 360);
 * video.setPlayOptions({ autoplay: true, muted: true, loop: true });
 * // 视频加载后自动播放
 * ```
 */
export default class VideoElement extends MediaElement implements IVideoElement, ISerializable {
  /** 图形类型标识 */
  public type: GraphType = GraphType.VIDEO;

  /** 平台无关的视频像素源，加载完成后赋值 */
  public video: IVideoSource | null = null;
  /** 是否自动播放，默认 `false` */
  public autoplay: boolean = false;
  /** 是否循环播放，默认 `false` */
  public loop: boolean = false;
  /** 是否静音，默认 `false` */
  public muted: boolean = false;
  /** 当前是否正在播放 */
  public playing: boolean = false;

  /**
   * 创建视频元素实例。
   *
   * @param {string} src - 视频资源的 URL 地址
   * @param {number} x - 矩形左上角 x 坐标
   * @param {number} y - 矩形左上角 y 坐标
   * @param {number} width - 矩形宽度
   * @param {number} height - 矩形高度
   * @param {Style} [style=Style.DEFAULT] - 元素样式
   *
   * @example
   * ```ts
   * const video = new VideoElement('movie.mp4', 0, 0, 640, 360);
   * ```
   */
  constructor(src: string, x: number, y: number, width: number, height: number, _style?: Style) {
    super(src, x, y, width, height);
    this.id = generateId(this.type)
  }

  /**
   * 加载视频资源。委托给 {@link loadVideo} 执行实际的异步加载。
   *
   * @protected
   * @returns {Promise<void>} 加载完成后 resolve
   *
   * @example
   * ```ts
   * // 由 MediaElement 构造函数自动调用
   * protected async loadMedia(): Promise<void> { return this.loadVideo(); }
   * ```
   */
  protected async loadMedia(): Promise<void> {
    return this.loadVideo();
  }

  /**
   * 异步加载视频。
   *
   * 引擎不再直接创建 HTMLVideoElement，改为通过平台注入的 IDrawingContext 加载像素源。
   * 构造时此方法为 no-op（不自动加载），需在 app 初始化时通过 loadVideoWithContext(ctx) 显式加载。
   *
   * @deprecated 请使用 loadVideoWithContext(ctx) 传入平台 DrawingContext 进行加载
   * @returns {Promise<void>} 立即 resolve（无操作）
   */
  private async loadVideo(): Promise<void> {
    // 引擎不再直接创建 DOM VideoElement。
    // 视频源加载需要通过 loadVideoWithContext(ctx) 由平台层注入。
    return Promise.resolve()
  }

  /**
   * 使用平台 DrawingContext 加载视频像素源。
   *
   * 调用 ctx.loadVideoSource() 获取平台无关的 IVideoSource，
   * 自动同步播放选项（autoplay/loop/muted），完成后更新 actualWidth/actualHeight/loaded。
   *
   * @param {IDrawingContext} ctx - 平台绘图上下文
   * @returns {Promise<void>} 加载完成后 resolve
   */
  async loadVideoWithContext(ctx: IDrawingContext): Promise<void> {
    if (!this.src) return
    try {
      const options: IVideoLoadOptions = {
        autoplay: this.autoplay,
        loop: this.loop,
        muted: this.muted,
        crossOrigin: 'anonymous',
      }
      const source = await ctx.loadVideoSource(this.src, options)
      this.video = source
      this.actualWidth = source.width
      this.actualHeight = source.height
      this.loaded = true
      this.updateControlPoints()
    } catch (e) {
      console.error(`Failed to load video: ${this.src}`, e)
    }
  }

  /**
   * 更换视频源并重新加载。
   *
   * 重置 `video`/`loaded` 状态，同步控制点和包围盒，然后触发异步重新加载。
   *
   * @param {string} src - 新的视频资源 URL
   * @returns {VideoElement} 当前实例，支持链式调用
   *
   * @example
   * ```ts
   * video.setVideoSrc('https://cdn.example.com/new-clip.mp4');
   * ```
   */
  setVideoSrc(src: string): VideoElement {
    this.src = src;
    this.video = null;
    this.loaded = false;
    // 重置为未加载状态时，更新控制点和边界框
    this.updateControlPoints();
    this.loadVideo();
    return this;
  }

  /**
   * 设置视频播放选项。
   *
   * 同时更新实例属性（`autoplay`/`loop`/`muted`）和底层 `HTMLVideoElement` 的对应属性，
   * 确保两者保持一致。仅更新传入的选项，未传入的选项保持不变。
   *
   * @param {{ autoplay?: boolean; loop?: boolean; muted?: boolean }} options - 播放选项
   * @param {boolean} [options.autoplay] - 是否自动播放
   * @param {boolean} [options.loop] - 是否循环播放
   * @param {boolean} [options.muted] - 是否静音
   * @returns {VideoElement} 当前实例，支持链式调用
   *
   * @example
   * ```ts
   * video.setPlayOptions({ autoplay: true, muted: true, loop: true });
   * ```
   */
  setPlayOptions(options: { autoplay?: boolean; loop?: boolean; muted?: boolean }): VideoElement {
    if (options.autoplay !== undefined) this.autoplay = options.autoplay;
    if (options.loop !== undefined) this.loop = options.loop;
    if (options.muted !== undefined) this.muted = options.muted;

    if (this.video) {
      this.video.autoplay = this.autoplay;
      this.video.loop = this.loop;
      this.video.muted = this.muted;
    }

    return this;
  }

  /**
   * 播放视频。
   *
   * 代理调用 `HTMLVideoElement.play()`，并将 {@link playing} 置为 `true`。
   * 若视频尚未加载完成，返回 reject 的 Promise。
   *
   * @returns {Promise<void>} 播放开始后 resolve；视频未加载时 reject
   *
   * @example
   * ```ts
   * await video.play();
   * video.playing; // true
   * ```
   */
  play(): Promise<void> {
    if (!this.video) {
      return Promise.reject(new Error("Video not loaded"));
    }

    this.playing = true;
    return this.video.play();
  }

  /**
   * 暂停视频。
   *
   * 代理调用 `HTMLVideoElement.pause()`，并将 {@link playing} 置为 `false`。
   *
   * @example
   * ```ts
   * video.play();
   * video.pause();
   * video.playing; // false
   * ```
   */
  pause(): void {
    if (this.video) {
      this.video.pause();
      this.playing = false;
    }
  }

  /**
   * 停止视频。
   *
   * 暂停播放并将 `currentTime` 重置为 0，{@link playing} 置为 `false`。
   *
   * @example
   * ```ts
   * video.stop();
   * video.getCurrentTime(); // 0
   * ```
   */
  stop(): void {
    if (this.video) {
      this.video.pause();
      this.video.currentTime = 0;
      this.playing = false;
    }
  }

  /**
   * 设置视频的当前播放时间。
   *
   * @param {number} time - 目标播放时间（秒）
   *
   * @example
   * ```ts
   * video.setCurrentTime(30); // 跳转到第 30 秒
   * ```
   */
  setCurrentTime(time: number): void {
    if (this.video) {
      this.video.currentTime = time;
    }
  }

  /**
   * 获取视频当前播放时间。
   *
   * @returns {number} 当前播放时间（秒）；视频未加载时返回 `0`
   *
   * @example
   * ```ts
   * const t = video.getCurrentTime(); // 例如 12.5
   * ```
   */
  getCurrentTime(): number {
    return this.video ? this.video.currentTime : 0;
  }

  /**
   * 获取视频总时长。
   *
   * @returns {number} 视频总时长（秒）；视频未加载时返回 `0`
   *
   * @example
   * ```ts
   * const duration = video.getDuration(); // 例如 120.0
   * ```
   */
  getDuration(): number {
    return this.video ? this.video.duration : 0;
  }

  /**
   * 设置视频音量。
   *
   * 音量值会被 clamp 到 `[0, 1]` 区间。
   *
   * @param {number} volume - 音量值，范围 `[0, 1]`
   *
   * @example
   * ```ts
   * video.setVolume(0.5); // 设置为 50% 音量
   * ```
   */
  setVolume(volume: number): void {
    if (this.video) {
      this.video.volume = Math.max(0, Math.min(1, volume));
    }
  }

  /**
   * 获取视频当前音量。
   *
   * @returns {number} 音量值，范围 `[0, 1]`；视频未加载时返回 `0`
   *
   * @example
   * ```ts
   * const vol = video.getVolume(); // 例如 0.5
   * ```
   */
  getVolume(): number {
    return this.video ? this.video.volume : 0;
  }

  /**
   * 渲染视频到 Canvas。
   *
   * 若视频尚未加载完成，调用 {@link renderPlaceholder} 绘制占位符；
   * 否则应用样式后使用 `ctx.drawImage` 将当前帧绘制到 `(x, y, width, height)` 矩形区域。
   * 绘制使用设置的 `width`/`height`，而非视频的原始尺寸。
   *
   * @param {IDrawingContext} ctx - Canvas 2D 渲染上下文
   *
   * @example
   * ```ts
   * video.render(ctx); // 绘制当前帧或占位符
   * ```
   */
  public render(ctx: IDrawingContext, style: Style): void {
    ctx.save();
    if (!this.video || !this.loaded) {
      // 如果视频未加载，绘制占位符
      this.renderPlaceholder(ctx);
      ctx.restore();
      return;
    }

    // 应用样式
    const bounds = this.bounds;
    style.applyToContext(ctx, Math.abs(bounds.width), Math.abs(bounds.height));

    // 绘制视频（使用设置的尺寸）
    ctx.drawImage(this.video, this.x, this.y, this.width, this.height);
    ctx.restore();
  }

  /**
   * 渲染占位符。当视频未加载完成时，绘制灰色边框、播放按钮图标和 "Loading..." 提示文字。
   *
   * @protected
   * @param {IDrawingContext} ctx - Canvas 2D 渲染上下文
   *
   * @example
   * ```ts
   * // 由 render() 在 loaded === false 时自动调用
   * video.renderPlaceholder(ctx);
   * ```
   */
  protected renderPlaceholder(ctx: IDrawingContext): void {
    ctx.strokeStyle = "#cccccc";
    ctx.lineWidth = 1;
    ctx.strokeRect(this.x, this.y, this.width, this.height);

    // 绘制播放按钮图标
    const centerX = this.x + this.width / 2;
    const centerY = this.y + this.height / 2;
    const iconSize = Math.min(this.width, this.height) * 0.3;

    ctx.fillStyle = "#999999";
    ctx.beginPath();
    ctx.moveTo(centerX - iconSize / 2, centerY - iconSize / 2);
    ctx.lineTo(centerX + iconSize / 2, centerY);
    ctx.lineTo(centerX - iconSize / 2, centerY + iconSize / 2);
    ctx.closePath();
    ctx.fill();

    // 绘制加载中文字
    ctx.fillStyle = "#999999";
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("Loading...", centerX, centerY + iconSize / 2 + 20);
  }

  /**
   * 获取视频当前帧的像素数据。
   *
   * 直接返回 video.data —— IVideoSource.data 是 getter，
   * 每次读取返回当前帧的 RGBA 像素（带时间维度）。
   * 需要视频已加载完成，否则返回 `null`。
   *
   * @returns {IImageSource | null} 当前帧像素数据；若未加载则返回 `null`
   */
  getImageData(): IImageSource | null {
    if (!this.video || !this.loaded) return null;

    return {
      width: this.video.width,
      height: this.video.height,
      data: this.video.data,
    }
  }

  /**
   * 复制视频元素。
   *
   * 创建一个相同属性（`src`、位置、尺寸、样式、播放选项）的新 {@link VideoElement} 实例。
   * 注意：复制后的实例不共享 `HTMLVideoElement`，需要重新加载。
   *
   * @returns {this} 新的视频元素实例
   *
   * @example
   * ```ts
   * const copy = video.copy();
   * copy.src;     // 与原实例相同
   * copy.muted;   // 与原实例相同
   * ```
   */
  public copy(): this {
    const copy = new VideoElement(this.src, this.x, this.y, this.width, this.height);
    copy.autoplay = this.autoplay;
    copy.loop = this.loop;
    copy.muted = this.muted;
    return copy as this;
  }

  // ── 序列化 ──

  /**
   * 将视频元素序列化为 JSON 对象，用于持久化存储。
   *
   * @returns {any} 包含 id、type、src、位置、尺寸、播放选项和样式的 JSON 对象
   *
   * @example
   * ```ts
   * const json = video.toJSON();
   * // { id: '...', type: 5, src: 'movie.mp4', x: 10, y: 20, ..., autoplay: true, loop: false, muted: true, style: {...} }
   * ```
   */
  toJSON(): any {
    return {
      id: this.id,
      type: this.type,
      src: this.src,
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      autoplay: this.autoplay,
      loop: this.loop,
      muted: this.muted,
    }
  }

  /**
   * 从 JSON 对象反序列化创建视频元素。
   *
   * @param {any} data - 序列化后的 JSON 数据
   * @returns {VideoElement} 恢复的视频元素实例
   *
   * @example
   * ```ts
   * const video = VideoElement.fromJSON(jsonData);
   * ```
   */
  static fromJSON(data: any): VideoElement {
    const el = new VideoElement(
      data.src,
      data.x,
      data.y,
      data.width,
      data.height,
    );
    el.id = data.id;
    el.autoplay = data.autoplay ?? false;
    el.loop = data.loop ?? false;
    el.muted = data.muted ?? false;
    return el;
  }

}
