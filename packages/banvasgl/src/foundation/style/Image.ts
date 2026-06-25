import type { PatternRepeat } from '@/types/foundation/media.js'
export type { PatternRepeat }

import type { PatternSize } from '@/types/foundation/style'

import { StyleType } from '@/foundation/constants'
import type { ISerializable } from '@/types/foundation/serializable'
import type { IDrawingContext } from '@/types/platform/context.js'
import type { IPattern } from '@/types/foundation/pattern.js'
import type { IImageSource } from '@/types/foundation/media.js'

/**
 * 图片图案填充样式
 *
 * 基于 Canvas 2D 的 createPattern 模型：以图片实际尺寸铺满整个画布坐标空间形成"颜色场"，
 * 然后图形形状从该颜色场中"挖出"可见区域。支持四种平铺模式和自定义尺寸。
 *
 * @example
 * ```ts
 * const pattern = Image.fromImage('logo.png', 64, 64, 'repeat')
 * fillStyle.setPattern(pattern)
 * ```
 */
export default class Image implements ISerializable {
  public readonly type: StyleType = StyleType.IMAGE_PATTERN
  src: string | null
  size: PatternSize | null
  repeat: PatternRepeat

  /** 平台加载的像素源（由 ctx.loadImageSource() 注入），null 表示尚未加载 */
  private _loadedSource: IImageSource | null = null

  /**
   * 构造图片图案
   *
   * 创建一个图片图案填充实例，可指定图片源、尺寸和平铺模式。
   *
   * @param src - 图片 URL 地址，null 表示无图片
   * @param size - 图案渲染尺寸，null 使用图片原始尺寸
   * @param repeat - 平铺模式，默认 'repeat'（双向平铺）
   *
   * @example
   * ```ts
   * const pattern = new Image('bg.png', { width: 100, height: 100 }, 'repeat')
   * ```
   */
  constructor(src: string | null = null, size: PatternSize | null = null, repeat: PatternRepeat = 'repeat') {
    this.src = src
    this.size = size
    this.repeat = repeat
  }

  /**
   * 设置图案源
   *
   * 更新图片 URL 地址，支持链式调用。
   *
   * @param src - 新的图片 URL 地址
   * @returns 当前 Image 实例（链式调用）
   *
   * @example
   * ```ts
   * pattern.setSrc('new-bg.png').setRepeat('no-repeat')
   * ```
   */
  setSrc(src: string): Image {
    this.src = src
    return this
  }

  /**
   * 设置图案尺寸
   *
   * 更新图案的渲染宽高，支持链式调用。
   *
   * @param size - 图案尺寸对象 { width, height }
   * @returns 当前 Image 实例（链式调用）
   *
   * @example
   * ```ts
   * pattern.setSize({ width: 128, height: 128 })
   * ```
   */
  setSize(size: PatternSize): Image {
    this.size = size
    return this
  }

  /**
   * 设置平铺模式
   *
   * 更新图案的平铺方式，支持链式调用。
   *
   * @param repeat - 平铺模式：'repeat' | 'repeat-x' | 'repeat-y' | 'no-repeat'
   * @returns 当前 Image 实例（链式调用）
   *
   * @example
   * ```ts
   * pattern.setRepeat('repeat-x') // 仅水平方向平铺
   * ```
   */
  setRepeat(repeat: PatternRepeat): Image {
    this.repeat = repeat
    return this
  }

  /**
   * 设置已加载的像素源。
   * 由平台层在加载图片后调用（ctx.loadImageSource → setLoadedSource）。
   */
  setLoadedSource(source: IImageSource | null): Image {
    this._loadedSource = source
    return this
  }

  /** 像素源是否已就绪 */
  hasLoadedSource(): boolean {
    return this._loadedSource !== null
  }

  /** 获取已加载的像素源（供 FillStyle/StrokeStyle 透传） */
  getLoadedSource(): IImageSource | null {
    return this._loadedSource
  }

  /**
   * 获取图案配置信息
   *
   * 返回当前图案的完整配置对象，包含源地址、尺寸和平铺模式。
   *
   * @returns 图案配置对象
   *
   * @example
   * ```ts
   * const info = pattern.getPatternInfo()
   * console.log(info.src, info.size, info.repeat)
   * ```
   */
  getPatternInfo(): { src: string | null; size: PatternSize | null; repeat: PatternRepeat } {
    return {
      src: this.src,
      size: this.size,
      repeat: this.repeat,
    }
  }

  /**
   * 创建 Canvas 图案对象
   *
   * 使用 Canvas 2D Context 创建原生 CanvasPattern 对象，
   * 可直接赋值给 ctx.fillStyle 或 ctx.strokeStyle。
   *
   * @param ctx - Canvas 2D 渲染上下文
   * @returns CanvasPattern 对象；若 src 为 null 则返回 null
   *
   * @example
   * ```ts
   * const canvasPattern = pattern.createCanvasPattern(ctx)
   * if (canvasPattern) {
   *   ctx.fillStyle = canvasPattern
   * }
   * ```
   */
  createCanvasPattern(ctx: IDrawingContext): IPattern | null {
    if (!this._loadedSource) return null

    // 使用平台注入的像素源创建图案，引擎不再直接创建 DOM Image
    return ctx.createPattern(this._loadedSource, this.repeat)
  }

  /**
   * 序列化为 JSON
   *
   * 将图案对象转换为可序列化的纯对象，配合 Serializer 使用。
   *
   * @returns 包含 src/size/repeat 的纯对象
   *
   * @example
   * ```ts
   * const json = pattern.toJSON()
   * // { src: 'bg.png', size: { width: 64, height: 64 }, repeat: 'repeat' }
   * ```
   */
  toJSON(): any {
    return { src: this.src, size: this.size, repeat: this.repeat }
  }

  /**
   * 从 JSON 反序列化
   *
   * 从 toJSON() 产生的纯对象还原 Image 实例。
   *
   * @param data - 包含 src/size/repeat 的纯对象
   * @returns 还原的 Image 实例
   *
   * @example
   * ```ts
   * const pattern = Image.fromJSON({ src: 'bg.png', size: null, repeat: 'repeat' })
   * ```
   */
  static fromJSON(data: any): Image {
    return new Image(data.src, data.size, data.repeat)
  }

  /**
   * 深拷贝
   *
   * 创建当前图案的独立副本，修改副本不影响原对象。
   *
   * @returns 新的 Image 实例，值与当前相同
   *
   * @example
   * ```ts
   * const cloned = pattern.copy()
   * cloned.setSrc('other.png') // 不影响原 pattern
   * ```
   */
  copy(): Image {
    const image = new Image(this.src, this.size, this.repeat)
    image._loadedSource = this._loadedSource
    return image
  }

  /**
   * 判断相等
   *
   * 比较两个图案的 src、size、repeat 是否完全相同。
   *
   * @param other - 待比较的图案对象
   * @returns 所有属性均相等时返回 true
   *
   * @example
   * ```ts
   * const a = Image.fromSrc('bg.png')
   * const b = Image.fromSrc('bg.png')
   * a.equals(b) // true
   * ```
   */
  equals(other: Image): boolean {
    return this.src === other.src && this.size === other.size && this.repeat === other.repeat
  }

  /**
   * 从 URL 创建图案
   *
   * 快捷工厂方法，从图片 URL 创建 Image 实例。
   *
   * @param src - 图片 URL 地址
   * @param size - 可选图案尺寸
   * @param repeat - 平铺模式，默认 'repeat'
   * @returns 新的 Image 实例
   *
   * @example
   * ```ts
   * const pattern = Image.fromSrc('texture.png', { width: 32, height: 32 })
   * ```
   */
  static fromSrc(src: string, size?: PatternSize, repeat: PatternRepeat = 'repeat'): Image {
    return new Image(src, size, repeat)
  }

  /**
   * 从 URL 和宽高创建图案
   *
   * 快捷工厂方法，直接指定图片 URL 和渲染宽高。
   *
   * @param src - 图片 URL 地址
   * @param width - 图案渲染宽度（像素）
   * @param height - 图案渲染高度（像素）
   * @param repeat - 平铺模式，默认 'repeat'
   * @returns 新的 Image 实例
   *
   * @example
   * ```ts
   * const pattern = Image.fromImage('logo.png', 64, 64, 'no-repeat')
   * ```
   */
  static fromImage(src: string, width: number, height: number, repeat: PatternRepeat = 'repeat'): Image {
    return new Image(src, { width, height }, repeat)
  }
}
