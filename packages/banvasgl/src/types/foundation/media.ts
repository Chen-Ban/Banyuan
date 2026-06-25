/**
 * 平台无关的媒体源接口
 *
 * 引擎视角：
 *   - 图片 = 宽度 × 高度 的 RGBA 像素阵列
 *   - 视频 = 带时间维度的像素帧序列（.data 每次读取返回当前帧）
 *
 * 这些是引擎自有数据契约，不属于平台注入的绘制能力（IDrawingContext）。
 * 平台适配器负责在加载时将平台媒体（HTMLImageElement / SkImage / ffmpeg 等）
 * 解码为这里定义的像素源。
 */

/**
 * 图像源（引擎自有像素数据）
 *
 * 引擎直接持有 RGBA 像素，平台适配器在加载时解码。
 */
export interface IImageSource {
  readonly width: number
  readonly height: number
  /** RGBA 像素数据（width × height × 4 字节） */
  readonly data: Uint8ClampedArray
}

/**
 * 视频源（引擎自有，带时间维度的像素帧序列）
 *
 * 继承 IImageSource 的数据模型，.data 是 getter，
 * 每次读取返回当前帧的 RGBA 像素（反映最新帧）。
 * 播放控制（play/pause/seek/volume）由平台适配器实现。
 */
export interface IVideoSource extends IImageSource {
  /** 播放视频 */
  play(): Promise<void>
  /** 暂停视频 */
  pause(): void
  /** 停止视频（暂停 + 回到起始位置） */
  stop(): void
  /** 当前是否正在播放 */
  readonly playing: boolean
  /** 当前播放时间（秒），可读写 */
  currentTime: number
  /** 视频总时长（秒），只读 */
  readonly duration: number
  /** 音量（0-1），可读写 */
  volume: number
  /** 是否自动播放 */
  autoplay: boolean
  /** 是否循环播放 */
  loop: boolean
  /** 是否静音 */
  muted: boolean
  /**
   * 批量设置播放选项。
   * 只更新传入的字段，未传入的保持不变。
   */
  setPlayOptions(options: IVideoLoadOptions): void
}

/** 视频加载选项 */
export interface IVideoLoadOptions {
  autoplay?: boolean
  loop?: boolean
  muted?: boolean
  /** 跨域模式，Web 平台对应 HTMLVideoElement.crossOrigin */
  crossOrigin?: string
}

/**
 * 图案平铺模式
 *
 * 对应 Canvas 2D createPattern 的 repetition 参数。
 * 从 foundation/style/Image.ts 提升到 types/foundation/media.ts，
 * 供 IDrawingContext.createPattern 和 Image 样式类共享。
 */
export type PatternRepeat = 'repeat' | 'repeat-x' | 'repeat-y' | 'no-repeat'
