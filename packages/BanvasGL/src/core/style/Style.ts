

import Color from './Color'
import FillStyle from './FillStyle'
import StrokeStyle from './StrokeStyle'
import ShadowStyle from './ShadowStyle'

export default class Style {
  fillStyle: FillStyle
  strokeStyle: StrokeStyle
  shadowStyle: ShadowStyle
  padding: {
    top: number
    right: number
    bottom: number
    left: number
  }
  margin: {
    top: number
    right: number
    bottom: number
    left: number
  }

  constructor(
    fillStyle: FillStyle = new FillStyle('color', Color.WHITE),
    strokeStyle: StrokeStyle = new StrokeStyle('color', Color.BLACK, null, null, 1),
    shadowStyle: ShadowStyle = ShadowStyle.NONE,
    padding: { top: number, right: number, bottom: number, left: number } = { top: 0, right: 0, bottom: 0, left: 0 },
    margin: { top: number, right: number, bottom: number, left: number } = { top: 0, right: 0, bottom: 0, left: 0 }
  ) {
    this.fillStyle = fillStyle
    this.strokeStyle = strokeStyle
    this.shadowStyle = shadowStyle
    this.padding = { ...padding }
    this.margin = { ...margin }
  }

  // 应用所有样式到 Canvas 上下文
  applyToContext(ctx: CanvasRenderingContext2D, width: number = 100, height: number = 100): void {
    // 应用阴影样式
    this.shadowStyle.applyToContext(ctx)
    
    // 应用描边样式
    this.strokeStyle.applyToContext(ctx)
    
    // 应用填充样式
    this.fillStyle.applyToContext(ctx, width, height)
  }

  // 设置填充样式
  setFillStyle(fillStyle: FillStyle): Style {
    this.fillStyle = fillStyle
    return this
  }

  // 设置描边样式
  setStrokeStyle(strokeStyle: StrokeStyle): Style {
    this.strokeStyle = strokeStyle
    return this
  }

  // 设置阴影样式
  setShadowStyle(shadowStyle: ShadowStyle): Style {
    this.shadowStyle = shadowStyle
    return this
  }

  // 快速设置填充颜色
  setFillColor(color: Color): Style {
    this.fillStyle.setColor(color)
    return this
  }

  // 快速设置描边颜色
  setStrokeColor(color: Color): Style {
    this.strokeStyle.setColor(color)
    return this
  }

  // 快速设置描边宽度
  setStrokeWidth(width: number): Style {
    this.strokeStyle.setWidth(width)
    return this
  }

  // 快速启用阴影
  enableShadow(offsetX: number = 2, offsetY: number = 2, blur: number = 4, opacity: number = 0.3): Style {
    this.shadowStyle = ShadowStyle.dropShadow(offsetX, offsetY, blur, opacity)
    return this
  }

  // 快速禁用阴影
  disableShadow(): Style {
    this.shadowStyle = ShadowStyle.NONE
    return this
  }

  // 设置padding
  setPadding(top: number, right: number, bottom: number, left: number): Style {
    this.padding = { top, right, bottom, left }
    return this
  }

  // 设置margin
  setMargin(top: number, right: number, bottom: number, left: number): Style {
    this.margin = { top, right, bottom, left }
    return this
  }

  // 设置统一的padding
  setPaddingAll(value: number): Style {
    this.padding = { top: value, right: value, bottom: value, left: value }
    return this
  }

  // 设置统一的margin
  setMarginAll(value: number): Style {
    this.margin = { top: value, right: value, bottom: value, left: value }
    return this
  }

  // 复制样式
  copy(): Style {
    return new Style(
      this.fillStyle.copy(),
      this.strokeStyle.copy(),
      this.shadowStyle.copy(),
      { ...this.padding },
      { ...this.margin }
    )
  }

  // 比较是否相等
  equals(other: Style): boolean {
    return this.fillStyle.equals(other.fillStyle) &&
           this.strokeStyle.equals(other.strokeStyle) &&
           this.shadowStyle.equals(other.shadowStyle) &&
           this.padding.top === other.padding.top &&
           this.padding.right === other.padding.right &&
           this.padding.bottom === other.padding.bottom &&
           this.padding.left === other.padding.left &&
           this.margin.top === other.margin.top &&
           this.margin.right === other.margin.right &&
           this.margin.bottom === other.margin.bottom &&
           this.margin.left === other.margin.left
  }

  // 静态工厂方法
  static fromFillColor(color: Color): Style {
    return new Style(new FillStyle('color', color))
  }

  static fromStrokeColor(color: Color, width: number = 1): Style {
    return new Style(new FillStyle('color', Color.TRANSPARENT), new StrokeStyle('color', color, null, null, width))
  }

  static fromFillAndStroke(fillColor: Color, strokeColor: Color, strokeWidth: number = 1): Style {
    return new Style(
      new FillStyle('color', fillColor),
      new StrokeStyle('color', strokeColor, null, null, strokeWidth)
    )
  }

  // 带padding的样式
  static withPadding(padding: number, fillColor: Color = Color.WHITE): Style {
    return new Style(
      new FillStyle('color', fillColor),
      new StrokeStyle('color', Color.BLACK, null, null, 1),
      ShadowStyle.NONE,
      { top: padding, right: padding, bottom: padding, left: padding }
    )
  }

  // 带margin的样式
  static withMargin(margin: number, fillColor: Color = Color.WHITE): Style {
    return new Style(
      new FillStyle('color', fillColor),
      new StrokeStyle('color', Color.BLACK, null, null, 1),
      ShadowStyle.NONE,
      { top: 0, right: 0, bottom: 0, left: 0 },
      { top: margin, right: margin, bottom: margin, left: margin }
    )
  }

  // 带padding和margin的样式
  static withSpacing(padding: number, margin: number, fillColor: Color = Color.WHITE): Style {
    return new Style(
      new FillStyle('color', fillColor),
      new StrokeStyle('color', Color.BLACK, null, null, 1),
      ShadowStyle.NONE,
      { top: padding, right: padding, bottom: padding, left: padding },
      { top: margin, right: margin, bottom: margin, left: margin }
    )
  }

  // 预定义样式
  static readonly DEFAULT = new Style()
  static readonly FILL_ONLY = new Style(new FillStyle('color', Color.WHITE), new StrokeStyle('color', Color.TRANSPARENT, null, null, 0))
  static readonly STROKE_ONLY = new Style(new FillStyle('color', Color.TRANSPARENT), new StrokeStyle('color', Color.BLACK, null, null, 1))
  static readonly FILL_AND_STROKE = new Style(new FillStyle('color', Color.WHITE), new StrokeStyle('color', Color.BLACK, null, null, 1))
  static readonly WITH_SHADOW = new Style(
    new FillStyle('color', Color.WHITE),
    new StrokeStyle('color', Color.BLACK, null, null, 1),
    ShadowStyle.SOFT_DROP
  )
}

// 命名导出
export { Style as StyleClass }