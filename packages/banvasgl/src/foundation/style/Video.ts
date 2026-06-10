/**
 * 视频图案平铺模式
 *
 * 与 PatternRepeat 语义相同，定义视频帧在画布上的平铺方式。
 *
 * @example
 * ```ts
 * const repeat: VideoRepeat = 'no-repeat' // 视频不平铺，仅显示一次
 * ```
 */
export type VideoRepeat = 'repeat' | 'repeat-x' | 'repeat-y' | 'no-repeat'

/**
 * 视频尺寸
 *
 * 指定视频在画布上的渲染宽高（像素）。
 *
 * @example
 * ```ts
 * const size: VideoSize = { width: 320, height: 240 }
 * ```
 */
export interface VideoSize {
  width: number
  height: number
}

import { StyleType } from '@/foundation/constants'
import type { ISerializable } from '@/types/foundation/serializable'

/**
 * 视频图案填充样式
 *
 * 与 Image 类似，Canvas 会将视频当前帧作为颜色场，
 * 图形形状从视频画面中采样可见区域。视频播放时画面实时更新。
 * 支持自动播放、循环、静音、控制条等视频播放属性。
 *
 * @example
 * ```ts
 * const video = Video.loop('animation.mp4', { width: 200, height: 150 })
 * fillStyle.setPattern(video)
 * ```
 */
export default class Video implements ISerializable {
  public readonly type: StyleType = StyleType.VIDEO_PATTERN;
  src: string | null
  size: VideoSize | null
  repeat: VideoRepeat
  autoplay: boolean
  loop: boolean
  muted: boolean
  controls: boolean

  /**
   * 构造视频图案
   *
   * 创建一个视频图案填充实例，可配置视频源、尺寸、平铺及播放属性。
   *
   * @param src - 视频 URL 地址，null 表示无视频
   * @param size - 视频渲染尺寸，null 使用视频原始尺寸
   * @param repeat - 平铺模式，默认 'no-repeat'
   * @param autoplay - 是否自动播放，默认 false
   * @param loop - 是否循环播放，默认 false
   * @param muted - 是否静音，默认 false
   * @param controls - 是否显示控制条，默认 false
   *
   * @example
   * ```ts
   * const video = new Video('bg.mp4', { width: 640, height: 480 }, 'no-repeat', true, true, true)
   * ```
   */
  constructor(
    src: string | null = null,
    size: VideoSize | null = null,
    repeat: VideoRepeat = 'no-repeat',
    autoplay: boolean = false,
    loop: boolean = false,
    muted: boolean = false,
    controls: boolean = false
  ) {
    this.src = src
    this.size = size
    this.repeat = repeat
    this.autoplay = autoplay
    this.loop = loop
    this.muted = muted
    this.controls = controls
  }

  /**
   * 设置视频源
   *
   * 更新视频 URL 地址，支持链式调用。
   *
   * @param src - 新的视频 URL 地址
   * @returns 当前 Video 实例（链式调用）
   *
   * @example
   * ```ts
   * video.setSrc('new-video.mp4').setAutoplay(true)
   * ```
   */
  setSrc(src: string): Video {
    this.src = src
    return this
  }

  /**
   * 设置视频尺寸
   *
   * 更新视频的渲染宽高，支持链式调用。
   *
   * @param size - 视频尺寸对象 { width, height }
   * @returns 当前 Video 实例（链式调用）
   *
   * @example
   * ```ts
   * video.setSize({ width: 1920, height: 1080 })
   * ```
   */
  setSize(size: VideoSize): Video {
    this.size = size
    return this
  }

  /**
   * 设置平铺模式
   *
   * 更新视频帧的平铺方式，支持链式调用。
   *
   * @param repeat - 平铺模式：'repeat' | 'repeat-x' | 'repeat-y' | 'no-repeat'
   * @returns 当前 Video 实例（链式调用）
   *
   * @example
   * ```ts
   * video.setRepeat('repeat') // 双向平铺视频帧
   * ```
   */
  setRepeat(repeat: VideoRepeat): Video {
    this.repeat = repeat
    return this
  }

  /**
   * 设置自动播放
   *
   * 配置视频是否自动开始播放，支持链式调用。
   *
   * @param autoplay - true 自动播放，false 手动触发
   * @returns 当前 Video 实例（链式调用）
   *
   * @example
   * ```ts
   * video.setAutoplay(true)
   * ```
   */
  setAutoplay(autoplay: boolean): Video {
    this.autoplay = autoplay
    return this
  }

  /**
   * 设置循环播放
   *
   * 配置视频是否循环播放，支持链式调用。
   *
   * @param loop - true 循环播放，false 播放一次后停止
   * @returns 当前 Video 实例（链式调用）
   *
   * @example
   * ```ts
   * video.setLoop(true)
   * ```
   */
  setLoop(loop: boolean): Video {
    this.loop = loop
    return this
  }

  /**
   * 设置静音
   *
   * 配置视频是否静音播放，支持链式调用。
   *
   * @param muted - true 静音，false 有声
   * @returns 当前 Video 实例（链式调用）
   *
   * @example
   * ```ts
   * video.setMuted(true)
   * ```
   */
  setMuted(muted: boolean): Video {
    this.muted = muted
    return this
  }

  /**
   * 设置控制条
   *
   * 配置视频是否显示播放控制条，支持链式调用。
   *
   * @param controls - true 显示控制条，false 隐藏
   * @returns 当前 Video 实例（链式调用）
   *
   * @example
   * ```ts
   * video.setControls(true)
   * ```
   */
  setControls(controls: boolean): Video {
    this.controls = controls
    return this
  }

  /**
   * 获取视频配置信息
   *
   * 返回当前视频的完整配置对象，包含所有属性。
   *
   * @returns 视频完整配置对象
   *
   * @example
   * ```ts
   * const info = video.getVideoInfo()
   * console.log(info.src, info.autoplay, info.loop)
   * ```
   */
  getVideoInfo(): { 
    src: string | null; 
    size: VideoSize | null; 
    repeat: VideoRepeat;
    autoplay: boolean;
    loop: boolean;
    muted: boolean;
    controls: boolean;
  } {
    return {
      src: this.src,
      size: this.size,
      repeat: this.repeat,
      autoplay: this.autoplay,
      loop: this.loop,
      muted: this.muted,
      controls: this.controls
    }
  }

  /**
   * 创建 HTML 视频元素
   *
   * 创建 HTMLVideoElement 实例并配置各属性，
   * 可用于 Canvas 2D 的 drawImage 或 createPattern。
   *
   * @returns HTMLVideoElement 实例；若 src 为 null 则返回 null
   *
   * @example
   * ```ts
   * const videoEl = video.createCanvasVideo()
   * if (videoEl) {
   *   ctx.drawImage(videoEl, 0, 0)
   * }
   * ```
   */
  createCanvasVideo(): HTMLVideoElement | null {
    if (!this.src) return null
    
    // 创建视频元素
    const video = document.createElement('video')
    video.src = this.src
    video.autoplay = this.autoplay
    video.loop = this.loop
    video.muted = this.muted
    video.controls = this.controls
    
    if (this.size) {
      video.width = this.size.width
      video.height = this.size.height
    }
    
    return video
  }

  /**
   * 检查视频源有效性
   *
   * 判断视频 URL 是否为非空有效字符串。
   *
   * @returns src 不为 null 且长度大于 0 时返回 true
   *
   * @example
   * ```ts
   * const video = new Video(null)
   * video.isValid() // false
   *
   * video.setSrc('movie.mp4')
   * video.isValid() // true
   * ```
   */
  isValid(): boolean {
    return this.src !== null && this.src.length > 0
  }

  /**
   * 序列化为 JSON
   *
   * 将视频样式对象转换为可序列化的纯对象。
   *
   * @returns 包含所有属性的纯对象
   *
   * @example
   * ```ts
   * const json = video.toJSON()
   * ```
   */
  toJSON(): any {
    return {
      src: this.src, size: this.size, repeat: this.repeat,
      autoplay: this.autoplay, loop: this.loop, muted: this.muted, controls: this.controls,
    }
  }

  /**
   * 从 JSON 反序列化
   *
   * 从 toJSON() 产生的纯对象还原 Video 实例。
   *
   * @param data - 包含视频所有属性的纯对象
   * @returns 还原的 Video 实例
   *
   * @example
   * ```ts
   * const video = Video.fromJSON({ src: 'a.mp4', size: null, repeat: 'no-repeat', ... })
   * ```
   */
  static fromJSON(data: any): Video {
    return new Video(data.src, data.size, data.repeat, data.autoplay, data.loop, data.muted, data.controls)
  }

  /**
   * 深拷贝
   *
   * 创建当前视频样式的独立副本。
   *
   * @returns 新的 Video 实例，值与当前相同
   *
   * @example
   * ```ts
   * const cloned = video.copy()
   * cloned.setSrc('other.mp4') // 不影响原 video
   * ```
   */
  copy(): Video {
    return new Video(
      this.src,
      this.size,
      this.repeat,
      this.autoplay,
      this.loop,
      this.muted,
      this.controls
    )
  }

  /**
   * 判断相等
   *
   * 比较两个视频样式的所有属性是否完全相同。
   *
   * @param other - 待比较的视频样式对象
   * @returns 所有属性均相等时返回 true
   *
   * @example
   * ```ts
   * video1.equals(video2) // true or false
   * ```
   */
  equals(other: Video): boolean {
    return this.src === other.src &&
           this.size === other.size &&
           this.repeat === other.repeat &&
           this.autoplay === other.autoplay &&
           this.loop === other.loop &&
           this.muted === other.muted &&
           this.controls === other.controls
  }

  /**
   * 从 URL 创建视频样式
   *
   * 快捷工厂方法，可选配置所有播放参数。
   *
   * @param src - 视频 URL 地址
   * @param size - 可选视频尺寸
   * @param repeat - 平铺模式，默认 'no-repeat'
   * @param autoplay - 是否自动播放，默认 false
   * @param loop - 是否循环播放，默认 false
   * @param muted - 是否静音，默认 false
   * @param controls - 是否显示控制条，默认 false
   * @returns 新的 Video 实例
   *
   * @example
   * ```ts
   * const video = Video.fromSrc('intro.mp4', { width: 640, height: 480 })
   * ```
   */
  static fromSrc(
    src: string, 
    size?: VideoSize, 
    repeat: VideoRepeat = 'no-repeat',
    autoplay: boolean = false,
    loop: boolean = false,
    muted: boolean = false,
    controls: boolean = false
  ): Video {
    return new Video(src, size, repeat, autoplay, loop, muted, controls)
  }

  /**
   * 从 URL 和宽高创建视频样式
   *
   * 快捷工厂方法，直接指定视频 URL 和渲染宽高。
   *
   * @param src - 视频 URL 地址
   * @param width - 渲染宽度（像素）
   * @param height - 渲染高度（像素）
   * @param repeat - 平铺模式，默认 'no-repeat'
   * @param autoplay - 是否自动播放，默认 false
   * @param loop - 是否循环播放，默认 false
   * @param muted - 是否静音，默认 false
   * @param controls - 是否显示控制条，默认 false
   * @returns 新的 Video 实例
   *
   * @example
   * ```ts
   * const video = Video.fromVideo('movie.mp4', 1920, 1080, 'no-repeat', true, true, true)
   * ```
   */
  static fromVideo(
    src: string, 
    width: number, 
    height: number, 
    repeat: VideoRepeat = 'no-repeat',
    autoplay: boolean = false,
    loop: boolean = false,
    muted: boolean = false,
    controls: boolean = false
  ): Video {
    return new Video(src, { width, height }, repeat, autoplay, loop, muted, controls)
  }

  /**
   * 创建自动播放视频
   *
   * 快捷工厂方法，创建自动播放、默认静音的视频样式。
   *
   * @param src - 视频 URL 地址
   * @param size - 可选视频尺寸
   * @param muted - 是否静音，默认 true
   * @returns 新的 Video 实例（autoplay=true）
   *
   * @example
   * ```ts
   * const bgVideo = Video.autoplay('ambient.mp4')
   * ```
   */
  static autoplay(src: string, size?: VideoSize, muted: boolean = true): Video {
    return new Video(src, size, 'no-repeat', true, false, muted, false)
  }

  /**
   * 创建循环播放视频
   *
   * 快捷工厂方法，创建自动播放 + 循环播放、默认静音的视频样式。
   *
   * @param src - 视频 URL 地址
   * @param size - 可选视频尺寸
   * @param muted - 是否静音，默认 true
   * @returns 新的 Video 实例（autoplay=true, loop=true）
   *
   * @example
   * ```ts
   * const loopVideo = Video.loop('animation.mp4', { width: 200, height: 200 })
   * ```
   */
  static loop(src: string, size?: VideoSize, muted: boolean = true): Video {
    return new Video(src, size, 'no-repeat', true, true, muted, false)
  }

  /**
   * 创建带控制条的视频
   *
   * 快捷工厂方法，创建显示播放控制条的视频样式。
   *
   * @param src - 视频 URL 地址
   * @param size - 可选视频尺寸
   * @returns 新的 Video 实例（controls=true）
   *
   * @example
   * ```ts
   * const playerVideo = Video.withControls('tutorial.mp4', { width: 800, height: 600 })
   * ```
   */
  static withControls(src: string, size?: VideoSize): Video {
    return new Video(src, size, 'no-repeat', false, false, false, true)
  }
}
