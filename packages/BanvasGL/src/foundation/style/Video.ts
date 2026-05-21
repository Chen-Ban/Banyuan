export type VideoRepeat = 'repeat' | 'repeat-x' | 'repeat-y' | 'no-repeat'

export interface VideoSize {
  width: number
  height: number
}

import { STYLETYPE } from '@/foundation/constants'
import type { ISerializable } from '@/types'

export default class Video implements ISerializable {
  public readonly type: STYLETYPE = STYLETYPE.VIDEO_PATTERN;
  src: string | null
  size: VideoSize | null
  repeat: VideoRepeat
  autoplay: boolean
  loop: boolean
  muted: boolean
  controls: boolean

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

  // 设置视频源
  setSrc(src: string): Video {
    this.src = src
    return this
  }

  // 设置视频尺寸
  setSize(size: VideoSize): Video {
    this.size = size
    return this
  }

  // 设置重复类型
  setRepeat(repeat: VideoRepeat): Video {
    this.repeat = repeat
    return this
  }

  // 设置自动播放
  setAutoplay(autoplay: boolean): Video {
    this.autoplay = autoplay
    return this
  }

  // 设置循环播放
  setLoop(loop: boolean): Video {
    this.loop = loop
    return this
  }

  // 设置静音
  setMuted(muted: boolean): Video {
    this.muted = muted
    return this
  }

  // 设置控制条
  setControls(controls: boolean): Video {
    this.controls = controls
    return this
  }

  // 获取视频信息
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

  // 创建 Canvas 视频对象
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

  // 检查视频是否有效
  isValid(): boolean {
    return this.src !== null && this.src.length > 0
  }

  // ── 序列化 ──
  toJSON(): any {
    return {
      src: this.src, size: this.size, repeat: this.repeat,
      autoplay: this.autoplay, loop: this.loop, muted: this.muted, controls: this.controls,
    }
  }

  static fromJSON(data: any): Video {
    return new Video(data.src, data.size, data.repeat, data.autoplay, data.loop, data.muted, data.controls)
  }

  // 复制视频
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

  // 比较是否相等
  equals(other: Video): boolean {
    return this.src === other.src &&
           this.size === other.size &&
           this.repeat === other.repeat &&
           this.autoplay === other.autoplay &&
           this.loop === other.loop &&
           this.muted === other.muted &&
           this.controls === other.controls
  }

  // 静态工厂方法
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

  // 创建自动播放视频
  static autoplay(src: string, size?: VideoSize, muted: boolean = true): Video {
    return new Video(src, size, 'no-repeat', true, false, muted, false)
  }

  // 创建循环播放视频
  static loop(src: string, size?: VideoSize, muted: boolean = true): Video {
    return new Video(src, size, 'no-repeat', true, true, muted, false)
  }

  // 创建带控制条的视频
  static withControls(src: string, size?: VideoSize): Video {
    return new Video(src, size, 'no-repeat', false, false, false, true)
  }
}
