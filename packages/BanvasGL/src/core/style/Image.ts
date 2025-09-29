export type PatternRepeat = 'repeat' | 'repeat-x' | 'repeat-y' | 'no-repeat'

export interface PatternSize {
  width: number
  height: number
}

export default class Image {
  src: string | null
  size: PatternSize | null
  repeat: PatternRepeat

  constructor(src: string | null = null, size: PatternSize | null = null, repeat: PatternRepeat = 'repeat') {
    this.src = src
    this.size = size
    this.repeat = repeat
  }

  // 设置图案源
  setSrc(src: string): Image {
    this.src = src
    return this
  }

  // 设置图案尺寸
  setSize(size: PatternSize): Image {
    this.size = size
    return this
  }

  // 设置重复类型
  setRepeat(repeat: PatternRepeat): Image {
    this.repeat = repeat
    return this
  }

  getPatternInfo(): { src: string | null; size: PatternSize | null; repeat: PatternRepeat; } {
    return {
      src: this.src,
      size: this.size,
      repeat: this.repeat,
    }
  }
  createCanvasPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
    if (!this.src) return null
    
    // 创建图像元素
    const img = new globalThis.Image()
    img.src = this.src
    
    // 创建图案
    const image = ctx.createPattern(img, this.repeat)
    return image
  }

  copy(): Image {
    const image = new Image(this.src, this.size, this.repeat)
    return image
  }

  equals(other: Image): boolean {
    return this.src === other.src &&
           this.size === other.size &&
           this.repeat === other.repeat
  }

  static fromSrc(src: string, size?: PatternSize, repeat: PatternRepeat = 'repeat'): Image {
    return new Image(src, size, repeat)
  }

  static fromImage(src: string, width: number, height: number, repeat: PatternRepeat = 'repeat'): Image {
    return new Image(src, { width, height }, repeat)
  }
}
