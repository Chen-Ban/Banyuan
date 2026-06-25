import Color from './Color'
import { LinearGradient, RadialGradient, ConicGradient } from './gradient/index'
import Image from './Image'
import { StyleType } from '@/foundation/constants'
import type { ISerializable } from '@/types/foundation/serializable'
import type { IDrawingContext } from '@/types/platform/context.js'
import type { StrokeType } from '@/types/foundation/style'

/**
 * 描边样式
 *
 * 封装 Canvas 2D 的 strokeStyle 以及 lineWidth、lineCap、lineJoin、虚线等属性。
 * Canvas 的渐变/图案描边同样基于颜色场模型，线条从颜色场中采样。
 *
 * @example
 * ```ts
 * const stroke = new StrokeStyle({ color: Color.RED, width: 2 })
 * stroke.applyToContext(ctx, 200, 100)
 * ```
 */
export default class StrokeStyle implements ISerializable {
  public readonly type: StyleType = StyleType.STROKE_STYLE
  strokeType: StrokeType
  color: Color
  linearGradient: LinearGradient | null
  radialGradient: RadialGradient | null
  conicGradient: ConicGradient | null
  pattern: Image | null
  width: number
  opacity: number
  lineCap: 'butt' | 'round' | 'square'
  lineJoin: 'miter' | 'round' | 'bevel'
  miterLimit: number
  dashArray: number[]
  dashOffset: number

  /**
   * 构造描边样式
   *
   * 根据传入的配置项初始化描边样式，所有配置均有合理默认值。
   *
   * @param options - 描边样式配置对象
   * @param options.strokeType - 描边类型，默认 'color'
   * @param options.color - 描边颜色，默认黑色
   * @param options.linearGradient - 线性渐变对象
   * @param options.radialGradient - 径向渐变对象
   * @param options.conicGradient - 圆锥渐变对象
   * @param options.pattern - 图片图案对象
   * @param options.width - 线宽，默认 1
   * @param options.opacity - 透明度，默认 1
   * @param options.lineCap - 线条端点样式，默认 'butt'
   * @param options.lineJoin - 线条连接样式，默认 'miter'
   * @param options.miterLimit - 斜接限制，默认 10
   * @param options.dashArray - 虚线模式数组，默认空数组（实线）
   * @param options.dashOffset - 虚线偏移量，默认 0
   * @returns StrokeStyle 实例
   * @example
   * ```ts
   * const stroke = new StrokeStyle({
   *   strokeType: 'color',
   *   color: Color.RED,
   *   width: 2,
   *   dashArray: [5, 3],
   * })
   * ```
   */
  constructor(
    options: {
      strokeType?: StrokeType
      color?: Color
      linearGradient?: LinearGradient | null
      radialGradient?: RadialGradient | null
      conicGradient?: ConicGradient | null
      pattern?: Image | null
      width?: number
      opacity?: number
      lineCap?: 'butt' | 'round' | 'square'
      lineJoin?: 'miter' | 'round' | 'bevel'
      miterLimit?: number
      dashArray?: number[]
      dashOffset?: number
    } = {},
  ) {
    const {
      strokeType = 'color',
      color = Color.BLACK,
      linearGradient = null,
      radialGradient = null,
      conicGradient = null,
      pattern = null,
      width = 1,
      opacity = 1,
      lineCap = 'butt',
      lineJoin = 'miter',
      miterLimit = 10,
      dashArray = [],
      dashOffset = 0,
    } = options

    this.strokeType = strokeType
    this.color = color
    this.linearGradient = linearGradient
    this.radialGradient = radialGradient
    this.conicGradient = conicGradient
    this.pattern = pattern
    this.width = width
    this.opacity = opacity
    this.lineCap = lineCap
    this.lineJoin = lineJoin
    this.miterLimit = miterLimit
    this.dashArray = [...dashArray]
    this.dashOffset = dashOffset
  }

  /**
   * 获取CSS颜色字符串
   *
   * 将当前描边颜色及透明度转换为 CSS rgba() 格式字符串，仅纯色模式下有意义。
   *
   * @returns CSS rgba() 格式的颜色字符串
   * @example
   * ```ts
   * const stroke = new StrokeStyle({ color: new Color(255, 0, 0), opacity: 0.5 })
   * console.log(stroke.cssColor) // "rgba(255, 0, 0, 0.5)"
   * ```
   */
  get cssColor(): string {
    const { r, g, b } = this.color
    return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${this.opacity})`
  }

  /**
   * 设置纯色描边
   *
   * 切换描边类型为纯色模式，清除已有的渐变和图案设置。支持链式调用。
   *
   * @param color - 要设置的颜色对象
   * @returns 当前 StrokeStyle 实例（链式调用）
   * @example
   * ```ts
   * stroke.setColor(Color.BLUE).setWidth(3)
   * ```
   */
  setColor(color: Color): StrokeStyle {
    this.strokeType = 'color'
    this.color = color
    this.clearGradients()
    this.pattern = null
    return this
  }

  /**
   * 设置线性渐变描边
   *
   * 切换描边类型为线性渐变模式，清除已有的其他渐变和图案设置。支持链式调用。
   *
   * @param gradient - 线性渐变对象
   * @returns 当前 StrokeStyle 实例（链式调用）
   * @example
   * ```ts
   * const gradient = new LinearGradient({ stops: [{ offset: 0, color: Color.RED }, { offset: 1, color: Color.BLUE }] })
   * stroke.setLinearGradient(gradient)
   * ```
   */
  setLinearGradient(gradient: LinearGradient): StrokeStyle {
    this.strokeType = 'linearGradient'
    this.clearGradients()
    this.linearGradient = gradient
    this.pattern = null
    return this
  }

  /**
   * 设置径向渐变描边
   *
   * 切换描边类型为径向渐变模式，清除已有的其他渐变和图案设置。支持链式调用。
   *
   * @param gradient - 径向渐变对象
   * @returns 当前 StrokeStyle 实例（链式调用）
   * @example
   * ```ts
   * const gradient = new RadialGradient({ stops: [{ offset: 0, color: Color.WHITE }, { offset: 1, color: Color.BLACK }] })
   * stroke.setRadialGradient(gradient)
   * ```
   */
  setRadialGradient(gradient: RadialGradient): StrokeStyle {
    this.strokeType = 'radialGradient'
    this.clearGradients()
    this.radialGradient = gradient
    this.pattern = null
    return this
  }

  /**
   * 设置圆锥渐变描边
   *
   * 切换描边类型为圆锥渐变模式，清除已有的其他渐变和图案设置。支持链式调用。
   *
   * @param gradient - 圆锥渐变对象
   * @returns 当前 StrokeStyle 实例（链式调用）
   * @example
   * ```ts
   * const gradient = new ConicGradient({ stops: [{ offset: 0, color: Color.RED }, { offset: 1, color: Color.GREEN }] })
   * stroke.setConicGradient(gradient)
   * ```
   */
  setConicGradient(gradient: ConicGradient): StrokeStyle {
    this.strokeType = 'conicGradient'
    this.clearGradients()
    this.conicGradient = gradient
    this.pattern = null
    return this
  }

  /**
   * 设置图案描边
   *
   * 切换描边类型为图片图案模式，清除已有的渐变设置。支持链式调用。
   *
   * @param pattern - 图片图案对象
   * @returns 当前 StrokeStyle 实例（链式调用）
   * @example
   * ```ts
   * const img = new Image({ src: 'pattern.png' })
   * stroke.setPattern(img)
   * ```
   */
  setPattern(pattern: Image): StrokeStyle {
    this.strokeType = 'image'
    this.pattern = pattern
    this.clearGradients()
    return this
  }

  private clearGradients(): void {
    this.linearGradient = null
    this.radialGradient = null
    this.conicGradient = null
  }

  /**
   * 设置线宽
   *
   * 设置描边线条的宽度，最小值为 0。支持链式调用。
   *
   * @param width - 线宽值（像素），负值会被截断为 0
   * @returns 当前 StrokeStyle 实例（链式调用）
   * @example
   * ```ts
   * stroke.setWidth(3)
   * ```
   */
  setWidth(width: number): StrokeStyle {
    this.width = Math.max(0, width)
    return this
  }

  /**
   * 设置描边透明度
   *
   * 设置描边的透明度，值被限制在 [0, 1] 范围内。支持链式调用。
   *
   * @param opacity - 透明度值，0 为完全透明，1 为完全不透明
   * @returns 当前 StrokeStyle 实例（链式调用）
   * @example
   * ```ts
   * stroke.setOpacity(0.5)
   * ```
   */
  setOpacity(opacity: number): StrokeStyle {
    this.opacity = Math.max(0, Math.min(1, opacity))
    return this
  }

  /**
   * 设置线条端点样式
   *
   * 设置描边线条两端的形状，影响开放路径的端点渲染。支持链式调用。
   *
   * @param lineCap - 端点样式：'butt'（平齐）、'round'（圆形）、'square'（方形）
   * @returns 当前 StrokeStyle 实例（链式调用）
   * @example
   * ```ts
   * stroke.setLineCap('round')
   * ```
   */
  setLineCap(lineCap: 'butt' | 'round' | 'square'): StrokeStyle {
    this.lineCap = lineCap
    return this
  }

  /**
   * 设置线条连接样式
   *
   * 设置两条线段相交时的连接形状。支持链式调用。
   *
   * @param lineJoin - 连接样式：'miter'（尖角）、'round'（圆角）、'bevel'（斜角）
   * @returns 当前 StrokeStyle 实例（链式调用）
   * @example
   * ```ts
   * stroke.setLineJoin('round')
   * ```
   */
  setLineJoin(lineJoin: 'miter' | 'round' | 'bevel'): StrokeStyle {
    this.lineJoin = lineJoin
    return this
  }

  /**
   * 设置斜接限制
   *
   * 当 lineJoin 为 'miter' 时，限制尖角的最大长度比。超过该比值时自动转为 bevel。支持链式调用。
   *
   * @param miterLimit - 斜接限制值，最小为 0
   * @returns 当前 StrokeStyle 实例（链式调用）
   * @example
   * ```ts
   * stroke.setMiterLimit(15)
   * ```
   */
  setMiterLimit(miterLimit: number): StrokeStyle {
    this.miterLimit = Math.max(0, miterLimit)
    return this
  }

  /**
   * 设置虚线模式
   *
   * 通过数组定义虚线的实线段与空白段交替长度。空数组表示实线。支持链式调用。
   *
   * @param dashArray - 虚线模式数组，如 [5, 3] 表示 5px 实线后跟 3px 空白
   * @returns 当前 StrokeStyle 实例（链式调用）
   * @example
   * ```ts
   * stroke.setDashArray([10, 5, 2, 5]) // 长短交替虚线
   * ```
   */
  setDashArray(dashArray: number[]): StrokeStyle {
    this.dashArray = [...dashArray]
    return this
  }

  /**
   * 设置虚线偏移量
   *
   * 设置虚线模式的起始偏移量，用于实现虚线动画等效果。支持链式调用。
   *
   * @param dashOffset - 偏移量（像素）
   * @returns 当前 StrokeStyle 实例（链式调用）
   * @example
   * ```ts
   * stroke.setDashOffset(3)
   * ```
   */
  setDashOffset(dashOffset: number): StrokeStyle {
    this.dashOffset = dashOffset
    return this
  }

  /**
   * 应用到Canvas上下文
   *
   * 将当前描边样式的所有属性（颜色/渐变/图案、线宽、端点、连接、虚线等）
   * 一次性应用到指定的 Canvas 2D 渲染上下文。
   *
   * @param ctx - Canvas 2D 渲染上下文
   * @param width - 图形包围盒宽度，用于渐变颜色场计算，默认 100
   * @param height - 图形包围盒高度，用于渐变颜色场计算，默认 100
   * @returns void
   * @example
   * ```ts
   * const stroke = StrokeStyle.fromHex('#FF0000', 2)
   * stroke.applyToContext(ctx, rect.width, rect.height)
   * ctx.strokeRect(0, 0, rect.width, rect.height)
   * ```
   */
  applyToContext(ctx: IDrawingContext, width: number = 100, height: number = 100): void {
    switch (this.strokeType) {
      case 'color':
        ctx.strokeStyle = this.cssColor
        break
      case 'linearGradient':
        if (this.linearGradient) {
          ctx.strokeStyle = this.linearGradient.createCanvasGradient(ctx, width, height)
        }
        break
      case 'radialGradient':
        if (this.radialGradient) {
          ctx.strokeStyle = this.radialGradient.createCanvasGradient(ctx, width, height)
        }
        break
      case 'conicGradient':
        if (this.conicGradient) {
          ctx.strokeStyle = this.conicGradient.createCanvasGradient(ctx, width, height)
        }
        break
      case 'image':
        if (this.pattern) {
          const canvasPattern = this.pattern.createCanvasPattern(ctx)
          if (canvasPattern) {
            ctx.strokeStyle = canvasPattern
          }
        }
        break
    }

    ctx.lineWidth = this.width
    ctx.lineCap = this.lineCap
    ctx.lineJoin = this.lineJoin
    ctx.miterLimit = this.miterLimit

    if (this.dashArray.length > 0) {
      ctx.setLineDash(this.dashArray)
      ctx.lineDashOffset = this.dashOffset
    } else {
      ctx.setLineDash([])
    }
  }

  /**
   * 序列化为JSON
   *
   * 将当前描边样式的所有属性序列化为纯 JSON 对象，支持持久化存储。
   *
   * @returns 包含所有描边属性的 JSON 对象
   * @example
   * ```ts
   * const json = stroke.toJSON()
   * localStorage.setItem('stroke', JSON.stringify(json))
   * ```
   */
  toJSON(): any {
    return {
      strokeType: this.strokeType,
      color: this.color.toJSON(),
      linearGradient: this.linearGradient?.toJSON() ?? null,
      radialGradient: this.radialGradient?.toJSON() ?? null,
      conicGradient: this.conicGradient?.toJSON() ?? null,
      pattern: this.pattern?.toJSON() ?? null,
      width: this.width,
      opacity: this.opacity,
      lineCap: this.lineCap,
      lineJoin: this.lineJoin,
      miterLimit: this.miterLimit,
      dashArray: this.dashArray,
      dashOffset: this.dashOffset,
    }
  }

  /**
   * 从JSON反序列化
   *
   * 从 JSON 对象重建 StrokeStyle 实例，是 toJSON 的逆操作。
   *
   * @param data - 由 toJSON 生成的 JSON 对象
   * @returns 重建的 StrokeStyle 实例
   * @example
   * ```ts
   * const json = stroke.toJSON()
   * const restored = StrokeStyle.fromJSON(json)
   * console.log(stroke.equals(restored)) // true
   * ```
   */
  static fromJSON(data: any): StrokeStyle {
    return new StrokeStyle({
      strokeType: data.strokeType,
      color: Color.fromJSON(data.color),
      linearGradient: data.linearGradient ? LinearGradient.fromJSON(data.linearGradient) : null,
      radialGradient: data.radialGradient ? RadialGradient.fromJSON(data.radialGradient) : null,
      conicGradient: data.conicGradient ? ConicGradient.fromJSON(data.conicGradient) : null,
      pattern: data.pattern ? Image.fromJSON(data.pattern) : null,
      width: data.width,
      opacity: data.opacity,
      lineCap: data.lineCap,
      lineJoin: data.lineJoin,
      miterLimit: data.miterLimit,
      dashArray: data.dashArray,
      dashOffset: data.dashOffset,
    })
  }

  /**
   * 深拷贝
   *
   * 创建当前描边样式的完整深拷贝，包含颜色、渐变、图案等所有子对象的独立副本。
   *
   * @returns 当前 StrokeStyle 的深拷贝实例
   * @example
   * ```ts
   * const copy = stroke.copy()
   * copy.setWidth(5) // 不影响原始 stroke
   * ```
   */
  copy(): StrokeStyle {
    return new StrokeStyle({
      strokeType: this.strokeType,
      color: this.color.copy(),
      linearGradient: this.linearGradient?.copy() || null,
      radialGradient: this.radialGradient?.copy() || null,
      conicGradient: this.conicGradient?.copy() || null,
      pattern: this.pattern?.copy() || null,
      width: this.width,
      opacity: this.opacity,
      lineCap: this.lineCap,
      lineJoin: this.lineJoin,
      miterLimit: this.miterLimit,
      dashArray: this.dashArray,
      dashOffset: this.dashOffset,
    })
  }

  /**
   * 判断相等
   *
   * 逐属性比较两个描边样式是否完全相等，包括颜色、渐变、线宽、虚线等所有属性。
   *
   * @param other - 要比较的另一个 StrokeStyle 实例
   * @returns 如果所有属性都相等则返回 true，否则返回 false
   * @example
   * ```ts
   * const a = StrokeStyle.fromHex('#FF0000', 2)
   * const b = StrokeStyle.fromHex('#FF0000', 2)
   * console.log(a.equals(b)) // true
   * ```
   */
  equals(other: StrokeStyle): boolean {
    if (this.strokeType !== other.strokeType) return false

    const baseEqual =
      this.width === other.width &&
      this.opacity === other.opacity &&
      this.lineCap === other.lineCap &&
      this.lineJoin === other.lineJoin &&
      this.miterLimit === other.miterLimit &&
      JSON.stringify(this.dashArray) === JSON.stringify(other.dashArray) &&
      this.dashOffset === other.dashOffset &&
      this.color.equals(other.color)

    if (!baseEqual) return false

    switch (this.strokeType) {
      case 'color':
        return true
      case 'linearGradient':
        return (
          this.linearGradient !== null &&
          other.linearGradient !== null &&
          this.linearGradient.equals(other.linearGradient)
        )
      case 'radialGradient':
        return (
          this.radialGradient !== null &&
          other.radialGradient !== null &&
          this.radialGradient.equals(other.radialGradient)
        )
      case 'conicGradient':
        return (
          this.conicGradient !== null &&
          other.conicGradient !== null &&
          this.conicGradient.equals(other.conicGradient)
        )
      case 'image':
        return this.pattern?.equals(other.pattern || new Image()) || false
      default:
        return false
    }
  }

  // ── 静态工厂方法 ──

  /**
   * 从颜色对象创建描边
   *
   * 使用 Color 对象创建纯色描边样式，可指定线宽和透明度。
   *
   * @param color - 描边颜色对象
   * @param width - 线宽，默认 1
   * @param opacity - 透明度，默认 1
   * @returns 新的 StrokeStyle 实例
   * @example
   * ```ts
   * const stroke = StrokeStyle.fromColor(Color.RED, 2, 0.8)
   * ```
   */
  static fromColor(color: Color, width: number = 1, opacity: number = 1): StrokeStyle {
    return new StrokeStyle({ strokeType: 'color', color, width, opacity })
  }

  /**
   * 从HEX字符串创建描边
   *
   * 使用十六进制颜色字符串创建纯色描边样式。
   *
   * @param hex - HEX 颜色字符串，如 '#FF0000' 或 '#F00'
   * @param width - 线宽，默认 1
   * @param opacity - 透明度，默认 1
   * @returns 新的 StrokeStyle 实例
   * @example
   * ```ts
   * const stroke = StrokeStyle.fromHex('#3498db', 2)
   * ```
   */
  static fromHex(hex: string, width: number = 1, opacity: number = 1): StrokeStyle {
    return new StrokeStyle({ strokeType: 'color', color: Color.fromHex(hex), width, opacity })
  }

  /**
   * 从HSL创建描边
   *
   * 使用色相、饱和度、亮度值创建纯色描边样式。
   *
   * @param h - 色相 (0-360)
   * @param s - 饱和度 (0-100)
   * @param l - 亮度 (0-100)
   * @param width - 线宽，默认 1
   * @param opacity - 透明度，默认 1
   * @returns 新的 StrokeStyle 实例
   * @example
   * ```ts
   * const stroke = StrokeStyle.fromHSL(210, 80, 50, 2)
   * ```
   */
  static fromHSL(h: number, s: number, l: number, width: number = 1, opacity: number = 1): StrokeStyle {
    return new StrokeStyle({ strokeType: 'color', color: Color.fromHSL(h, s, l), width, opacity })
  }

  /**
   * 从RGB创建描边
   *
   * 使用红、绿、蓝通道值创建纯色描边样式。
   *
   * @param r - 红色通道 (0-255)
   * @param g - 绿色通道 (0-255)
   * @param b - 蓝色通道 (0-255)
   * @param width - 线宽，默认 1
   * @param opacity - 透明度，默认 1
   * @returns 新的 StrokeStyle 实例
   * @example
   * ```ts
   * const stroke = StrokeStyle.fromRGB(255, 128, 0, 3)
   * ```
   */
  static fromRGB(r: number, g: number, b: number, width: number = 1, opacity: number = 1): StrokeStyle {
    return new StrokeStyle({ strokeType: 'color', color: new Color(r, g, b), width, opacity })
  }

  /**
   * 从线性渐变创建描边
   *
   * 使用线性渐变对象创建渐变描边样式。
   *
   * @param gradient - 线性渐变对象
   * @param width - 线宽，默认 1
   * @param opacity - 透明度，默认 1
   * @returns 新的 StrokeStyle 实例
   * @example
   * ```ts
   * const gradient = new LinearGradient({ stops: [{ offset: 0, color: Color.RED }, { offset: 1, color: Color.BLUE }] })
   * const stroke = StrokeStyle.fromLinearGradient(gradient, 2)
   * ```
   */
  static fromLinearGradient(gradient: LinearGradient, width: number = 1, opacity: number = 1): StrokeStyle {
    return new StrokeStyle({ strokeType: 'linearGradient', linearGradient: gradient, width, opacity })
  }

  /**
   * 从径向渐变创建描边
   *
   * 使用径向渐变对象创建渐变描边样式。
   *
   * @param gradient - 径向渐变对象
   * @param width - 线宽，默认 1
   * @param opacity - 透明度，默认 1
   * @returns 新的 StrokeStyle 实例
   * @example
   * ```ts
   * const gradient = new RadialGradient({ stops: [{ offset: 0, color: Color.WHITE }, { offset: 1, color: Color.BLACK }] })
   * const stroke = StrokeStyle.fromRadialGradient(gradient, 2)
   * ```
   */
  static fromRadialGradient(gradient: RadialGradient, width: number = 1, opacity: number = 1): StrokeStyle {
    return new StrokeStyle({ strokeType: 'radialGradient', radialGradient: gradient, width, opacity })
  }

  /**
   * 从圆锥渐变创建描边
   *
   * 使用圆锥渐变对象创建渐变描边样式。
   *
   * @param gradient - 圆锥渐变对象
   * @param width - 线宽，默认 1
   * @param opacity - 透明度，默认 1
   * @returns 新的 StrokeStyle 实例
   * @example
   * ```ts
   * const gradient = new ConicGradient({ stops: [{ offset: 0, color: Color.RED }, { offset: 1, color: Color.GREEN }] })
   * const stroke = StrokeStyle.fromConicGradient(gradient, 2)
   * ```
   */
  static fromConicGradient(gradient: ConicGradient, width: number = 1, opacity: number = 1): StrokeStyle {
    return new StrokeStyle({ strokeType: 'conicGradient', conicGradient: gradient, width, opacity })
  }

  /**
   * 从图片图案创建描边
   *
   * 使用图片图案对象创建平铺图案描边样式。
   *
   * @param pattern - 图片图案对象
   * @param width - 线宽，默认 1
   * @param opacity - 透明度，默认 1
   * @returns 新的 StrokeStyle 实例
   * @example
   * ```ts
   * const img = new Image({ src: 'texture.png' })
   * const stroke = StrokeStyle.fromPattern(img, 3)
   * ```
   */
  static fromPattern(pattern: Image, width: number = 1, opacity: number = 1): StrokeStyle {
    return new StrokeStyle({ strokeType: 'image', pattern, width, opacity })
  }

  /**
   * 创建虚线描边
   *
   * 快捷工厂方法，创建指定颜色和虚线模式的虚线描边样式。
   *
   * @param color - 描边颜色，默认黑色
   * @param width - 线宽，默认 1
   * @param dashPattern - 虚线模式数组，默认 [5, 5]
   * @returns 新的虚线 StrokeStyle 实例
   * @example
   * ```ts
   * const dashed = StrokeStyle.dashed(Color.RED, 2, [10, 5])
   * ```
   */
  static dashed(color: Color = Color.BLACK, width: number = 1, dashPattern: number[] = [5, 5]): StrokeStyle {
    return new StrokeStyle({
      strokeType: 'color',
      color,
      width,
      opacity: 1,
      lineCap: 'butt',
      lineJoin: 'miter',
      miterLimit: 10,
      dashArray: dashPattern,
      dashOffset: 0,
    })
  }

  /**
   * 创建点线描边
   *
   * 快捷工厂方法，创建指定颜色的点线（圆点间隔）描边样式。
   * 使用圆形端点和 [1, 3] 虚线模式实现点线效果。
   *
   * @param color - 描边颜色，默认黑色
   * @param width - 线宽，默认 1
   * @returns 新的点线 StrokeStyle 实例
   * @example
   * ```ts
   * const dotted = StrokeStyle.dotted(Color.BLUE, 2)
   * ```
   */
  static dotted(color: Color = Color.BLACK, width: number = 1): StrokeStyle {
    return new StrokeStyle({
      strokeType: 'color',
      color,
      width,
      opacity: 1,
      lineCap: 'round',
      lineJoin: 'round',
      miterLimit: 10,
      dashArray: [1, 3],
      dashOffset: 0,
    })
  }

  // ── 预定义样式 ──
  static readonly SOLID_BLACK = new StrokeStyle({ strokeType: 'color', color: Color.BLACK, width: 1 })
  static readonly SOLID_WHITE = new StrokeStyle({ strokeType: 'color', color: Color.WHITE, width: 1 })
  static readonly SOLID_RED = new StrokeStyle({ strokeType: 'color', color: Color.RED, width: 1 })
  static readonly SOLID_GREEN = new StrokeStyle({ strokeType: 'color', color: Color.GREEN, width: 1 })
  static readonly SOLID_BLUE = new StrokeStyle({ strokeType: 'color', color: Color.BLUE, width: 1 })
  static readonly DASHED_BLACK = StrokeStyle.dashed(Color.BLACK, 1)
  static readonly DOTTED_BLACK = StrokeStyle.dotted(Color.BLACK, 1)
}
