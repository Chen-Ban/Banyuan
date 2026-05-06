import Color from './Color'
import Gradient from './Gradient'
import Image from './Image'
import { STYLETYPE } from '@/core/constants'
import type { ISerializable } from '@/core/interfaces'

export type StrokeType = 'color' | 'gradient' | 'image'

export default class StrokeStyle implements ISerializable {
  public readonly type: STYLETYPE = STYLETYPE.STROKE_STYLE;
  strokeType: StrokeType
  color: Color
  gradient: Gradient | null
  pattern: Image | null
  width: number
  opacity: number
  lineCap: 'butt' | 'round' | 'square'
  lineJoin: 'miter' | 'round' | 'bevel'
  miterLimit: number
  dashArray: number[]
  dashOffset: number

  constructor(options: {
    strokeType?: StrokeType
    color?: Color
    gradient?: Gradient | null
    pattern?: Image | null
    width?: number
    opacity?: number
    lineCap?: 'butt' | 'round' | 'square'
    lineJoin?: 'miter' | 'round' | 'bevel'
    miterLimit?: number
    dashArray?: number[]
    dashOffset?: number
  } = {}) {
    const {
      strokeType = 'color',
      color = Color.BLACK,
      gradient = null,
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
    this.gradient = gradient
    this.pattern = pattern
    this.width = width
    this.opacity = opacity
    this.lineCap = lineCap
    this.lineJoin = lineJoin
    this.miterLimit = miterLimit
    this.dashArray = [...dashArray]
    this.dashOffset = dashOffset
  }

  // 获取 CSS 颜色字符串
  get cssColor(): string {
    const { r, g, b } = this.color
    return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${this.opacity})`
  }

  // 设置为纯色描边
  setColor(color: Color): StrokeStyle {
    this.strokeType = 'color'
    this.color = color
    this.gradient = null
    this.pattern = null
    return this
  }

  // 设置为渐变描边
  setGradient(gradient: Gradient): StrokeStyle {
    this.strokeType = 'gradient'
    this.gradient = gradient
    this.pattern = null
    return this
  }

  // 设置为图案描边
  setPattern(pattern: Image): StrokeStyle {
    this.strokeType = 'image'
    this.pattern = pattern
    this.gradient = null
    return this
  }

  // 设置宽度
  setWidth(width: number): StrokeStyle {
    this.width = Math.max(0, width)
    return this
  }

  // 设置透明度
  setOpacity(opacity: number): StrokeStyle {
    this.opacity = Math.max(0, Math.min(1, opacity))
    return this
  }

  // 设置线条端点样式
  setLineCap(lineCap: 'butt' | 'round' | 'square'): StrokeStyle {
    this.lineCap = lineCap
    return this
  }

  // 设置线条连接样式
  setLineJoin(lineJoin: 'miter' | 'round' | 'bevel'): StrokeStyle {
    this.lineJoin = lineJoin
    return this
  }

  // 设置斜接限制
  setMiterLimit(miterLimit: number): StrokeStyle {
    this.miterLimit = Math.max(0, miterLimit)
    return this
  }

  // 设置虚线样式
  setDashArray(dashArray: number[]): StrokeStyle {
    this.dashArray = [...dashArray]
    return this
  }

  // 设置虚线偏移
  setDashOffset(dashOffset: number): StrokeStyle {
    this.dashOffset = dashOffset
    return this
  }

  // 应用样式到 Canvas 上下文
  applyToContext(ctx: CanvasRenderingContext2D, width: number = 100, height: number = 100): void {
    switch (this.strokeType) {
      case 'color':
        ctx.strokeStyle = this.cssColor
        break
      case 'gradient':
        if (this.gradient) {
          const canvasGradient = this.gradient.createCanvasGradient(ctx, width, height)
          if (canvasGradient) {
            ctx.strokeStyle = canvasGradient
          }
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

  // ── 序列化 ──
  toJSON(): any {
    return {
      strokeType: this.strokeType,
      color: this.color.toJSON(),
      gradient: this.gradient?.toJSON() ?? null,
      pattern: this.pattern?.toJSON() ?? null,
      width: this.width, opacity: this.opacity,
      lineCap: this.lineCap, lineJoin: this.lineJoin, miterLimit: this.miterLimit,
      dashArray: this.dashArray, dashOffset: this.dashOffset,
    }
  }

  static fromJSON(data: any): StrokeStyle {
    return new StrokeStyle({
      strokeType: data.strokeType,
      color: Color.fromJSON(data.color),
      gradient: data.gradient ? Gradient.fromJSON(data.gradient) : null,
      pattern: data.pattern ? Image.fromJSON(data.pattern) : null,
      width: data.width, opacity: data.opacity,
      lineCap: data.lineCap, lineJoin: data.lineJoin, miterLimit: data.miterLimit,
      dashArray: data.dashArray, dashOffset: data.dashOffset,
    })
  }

  // 复制样式
  copy(): StrokeStyle {
    return new StrokeStyle({
      strokeType: this.strokeType,
      color: this.color.copy(),
      gradient: this.gradient?.copy() || null,
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

  // 比较是否相等
  equals(other: StrokeStyle): boolean {
    if (this.strokeType !== other.strokeType) return false
    
    return this.width === other.width &&
           this.opacity === other.opacity &&
           this.lineCap === other.lineCap &&
           this.lineJoin === other.lineJoin &&
           this.miterLimit === other.miterLimit &&
           JSON.stringify(this.dashArray) === JSON.stringify(other.dashArray) &&
           this.dashOffset === other.dashOffset &&
           this.color.equals(other.color) &&
           (this.gradient?.equals(other.gradient || new Gradient()) || false) &&
           (this.pattern?.equals(other.pattern || new Image()) || false)
  }

  // 静态工厂方法
  static fromColor(color: Color, width: number = 1, opacity: number = 1): StrokeStyle {
    return new StrokeStyle({
      strokeType: 'color',
      color,
      width,
      opacity,
    })
  }

  static fromHex(hex: string, width: number = 1, opacity: number = 1): StrokeStyle {
    return new StrokeStyle({
      strokeType: 'color',
      color: Color.fromHex(hex),
      width,
      opacity,
    })
  }

  static fromHSL(h: number, s: number, l: number, width: number = 1, opacity: number = 1): StrokeStyle {
    return new StrokeStyle({
      strokeType: 'color',
      color: Color.fromHSL(h, s, l),
      width,
      opacity,
    })
  }

  static fromRGB(r: number, g: number, b: number, width: number = 1, opacity: number = 1): StrokeStyle {
    return new StrokeStyle({
      strokeType: 'color',
      color: new Color(r, g, b),
      width,
      opacity,
    })
  }

  static fromGradient(gradient: Gradient, width: number = 1, opacity: number = 1): StrokeStyle {
    return new StrokeStyle({
      strokeType: 'gradient',
      color: Color.BLACK,
      gradient,
      width,
      opacity,
    })
  }

  static fromPattern(pattern: Image, width: number = 1, opacity: number = 1): StrokeStyle {
    return new StrokeStyle({
      strokeType: 'image',
      color: Color.BLACK,
      pattern,
      width,
      opacity,
    })
  }

  // 创建虚线样式
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

  // 预定义样式
  static readonly SOLID_BLACK = new StrokeStyle({ strokeType: 'color', color: Color.BLACK, width: 1 })
  static readonly SOLID_WHITE = new StrokeStyle({ strokeType: 'color', color: Color.WHITE, width: 1 })
  static readonly SOLID_RED = new StrokeStyle({ strokeType: 'color', color: Color.RED, width: 1 })
  static readonly SOLID_GREEN = new StrokeStyle({ strokeType: 'color', color: Color.GREEN, width: 1 })
  static readonly SOLID_BLUE = new StrokeStyle({ strokeType: 'color', color: Color.BLUE, width: 1 })
  static readonly DASHED_BLACK = StrokeStyle.dashed(Color.BLACK, 1)
  static readonly DOTTED_BLACK = StrokeStyle.dotted(Color.BLACK, 1)
}
