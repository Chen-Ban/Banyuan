

import Color from './Color'
import FillStyle from './FillStyle'
import StrokeStyle from './StrokeStyle'
import ShadowStyle from './ShadowStyle'

export default class Style {
  fillStyle: FillStyle
  strokeStyle: StrokeStyle
  shadowStyle: ShadowStyle

  constructor(options: {
    fillStyle?: FillStyle
    strokeStyle?: StrokeStyle
    shadowStyle?: ShadowStyle
  } = {}) {
    const {
      fillStyle = new FillStyle({ type: 'color', color: Color.WHITE }),
      strokeStyle = new StrokeStyle({ type: 'color', color: Color.BLACK, width: 1 }),
      shadowStyle = ShadowStyle.NONE,
    } = options

    this.fillStyle = fillStyle
    this.strokeStyle = strokeStyle
    this.shadowStyle = shadowStyle
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


  // 复制样式
  copy(): Style {
    return new Style({
      fillStyle: this.fillStyle.copy(),
      strokeStyle: this.strokeStyle.copy(),
      shadowStyle: this.shadowStyle.copy(),
    })
  }

  // 比较是否相等
  equals(other: Style): boolean {
    return this.fillStyle.equals(other.fillStyle) &&
      this.strokeStyle.equals(other.strokeStyle) &&
      this.shadowStyle.equals(other.shadowStyle)
  }

  // 静态工厂方法
  static fromFillColor(color: Color): Style {
    return new Style({
      fillStyle: new FillStyle({ type: 'color', color }),
    })
  }

  static fromStrokeColor(color: Color, width: number = 1): Style {
    return new Style({
      fillStyle: new FillStyle({ type: 'color', color: Color.TRANSPARENT }),
      strokeStyle: new StrokeStyle({ type: 'color', color, width }),
    })
  }

  static fromFillAndStroke(fillColor: Color, strokeColor: Color, strokeWidth: number = 1): Style {
    return new Style({
      fillStyle: new FillStyle({ type: 'color', color: fillColor }),
      strokeStyle: new StrokeStyle({ type: 'color', color: strokeColor, width: strokeWidth }),
    })
  }


  // 预定义样式
  static readonly DEFAULT = new Style()
  static readonly FILL_ONLY = new Style({
    fillStyle: new FillStyle({ type: 'color', color: Color.WHITE }),
    strokeStyle: new StrokeStyle({ type: 'color', color: Color.TRANSPARENT, width: 0 }),
  })
  static readonly STROKE_ONLY = new Style({
    fillStyle: new FillStyle({ type: 'color', color: Color.TRANSPARENT }),
    strokeStyle: new StrokeStyle({ type: 'color', color: Color.BLACK, width: 1 }),
  })
  static readonly FILL_AND_STROKE = new Style({
    fillStyle: new FillStyle({ type: 'color', color: Color.WHITE }),
    strokeStyle: new StrokeStyle({ type: 'color', color: Color.BLACK, width: 1 }),
  })
  static readonly WITH_SHADOW = new Style({
    fillStyle: new FillStyle({ type: 'color', color: Color.WHITE }),
    strokeStyle: new StrokeStyle({ type: 'color', color: Color.BLACK, width: 1 }),
    shadowStyle: ShadowStyle.SOFT_DROP,
  })
}
