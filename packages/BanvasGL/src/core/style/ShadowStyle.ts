import Color from './Color'

export default class ShadowStyle {
  color: Color
  offsetX: number
  offsetY: number
  blur: number
  opacity: number
  enabled: boolean

  constructor(options: {
    color?: Color
    offsetX?: number
    offsetY?: number
    blur?: number
    opacity?: number
    enabled?: boolean
  } = {}) {
    const {
      color = Color.BLACK,
      offsetX = 0,
      offsetY = 0,
      blur = 0,
      opacity = 0.5,
      enabled = false,
    } = options

    this.color = color
    this.offsetX = offsetX
    this.offsetY = offsetY
    this.blur = Math.max(0, blur)
    this.opacity = Math.max(0, Math.min(1, opacity))
    this.enabled = enabled
  }

  // 获取 CSS 阴影字符串
  get cssShadow(): string {
    if (!this.enabled) return 'none'

    const { r, g, b } = this.color
    return `${this.offsetX}px ${this.offsetY}px ${this.blur}px rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${this.opacity})`
  }

  // 设置颜色
  setColor(color: Color): ShadowStyle {
    this.color = color
    return this
  }

  // 设置偏移
  setOffset(offsetX: number, offsetY: number): ShadowStyle {
    this.offsetX = offsetX
    this.offsetY = offsetY
    return this
  }

  // 设置模糊半径
  setBlur(blur: number): ShadowStyle {
    this.blur = Math.max(0, blur)
    return this
  }

  // 设置透明度
  setOpacity(opacity: number): ShadowStyle {
    this.opacity = Math.max(0, Math.min(1, opacity))
    return this
  }

  // 启用/禁用阴影
  setEnabled(enabled: boolean): ShadowStyle {
    this.enabled = enabled
    return this
  }

  // 应用样式到 Canvas 上下文
  applyToContext(ctx: CanvasRenderingContext2D): void {
    if (this.enabled) {
      const { r, g, b } = this.color
      ctx.shadowColor = `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${this.opacity})`
      ctx.shadowOffsetX = this.offsetX
      ctx.shadowOffsetY = this.offsetY
      ctx.shadowBlur = this.blur
    } else {
      ctx.shadowColor = 'transparent'
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 0
      ctx.shadowBlur = 0
    }
  }

  // 复制样式
  copy(): ShadowStyle {
    return new ShadowStyle({
      color: this.color.copy(),
      offsetX: this.offsetX,
      offsetY: this.offsetY,
      blur: this.blur,
      opacity: this.opacity,
      enabled: this.enabled,
    })
  }

  // 克隆并修改
  clone(): ShadowStyle {
    return this.copy()
  }

  // 比较是否相等
  equals(other: ShadowStyle): boolean {
    return this.color.equals(other.color) &&
      this.offsetX === other.offsetX &&
      this.offsetY === other.offsetY &&
      this.blur === other.blur &&
      this.opacity === other.opacity &&
      this.enabled === other.enabled
  }

  // 静态工厂方法
  static fromHex(hex: string, offsetX: number = 0, offsetY: number = 0, blur: number = 0, opacity: number = 0.5): ShadowStyle {
    return new ShadowStyle({
      color: Color.fromHex(hex),
      offsetX,
      offsetY,
      blur,
      opacity,
      enabled: true,
    })
  }

  static fromHSL(h: number, s: number, l: number, offsetX: number = 0, offsetY: number = 0, blur: number = 0, opacity: number = 0.5): ShadowStyle {
    return new ShadowStyle({
      color: Color.fromHSL(h, s, l),
      offsetX,
      offsetY,
      blur,
      opacity,
      enabled: true,
    })
  }

  static fromRGB(r: number, g: number, b: number, offsetX: number = 0, offsetY: number = 0, blur: number = 0, opacity: number = 0.5): ShadowStyle {
    return new ShadowStyle({
      color: new Color(r, g, b),
      offsetX,
      offsetY,
      blur,
      opacity,
      enabled: true,
    })
  }

  // 创建常见阴影效果
  static dropShadow(offsetX: number = 2, offsetY: number = 2, blur: number = 4, opacity: number = 0.3): ShadowStyle {
    return new ShadowStyle({
      color: Color.BLACK,
      offsetX,
      offsetY,
      blur,
      opacity,
      enabled: true,
    })
  }

  static glow(color: Color = Color.WHITE, blur: number = 10, opacity: number = 0.8): ShadowStyle {
    return new ShadowStyle({
      color,
      offsetX: 0,
      offsetY: 0,
      blur,
      opacity,
      enabled: true,
    })
  }

  static innerShadow(color: Color = Color.BLACK, offsetX: number = 1, offsetY: number = 1, blur: number = 2, opacity: number = 0.5): ShadowStyle {
    return new ShadowStyle({
      color,
      offsetX,
      offsetY,
      blur,
      opacity,
      enabled: true,
    })
  }

  // 预定义样式
  static readonly NONE = new ShadowStyle({
    color: Color.BLACK,
    offsetX: 0,
    offsetY: 0,
    blur: 0,
    opacity: 0,
    enabled: false,
  })
  static readonly SOFT_DROP = ShadowStyle.dropShadow(2, 2, 4, 0.3)
  static readonly HARD_DROP = ShadowStyle.dropShadow(2, 2, 0, 0.5)
  static readonly GLOW_WHITE = ShadowStyle.glow(Color.WHITE, 10, 0.8)
  static readonly GLOW_BLUE = ShadowStyle.glow(Color.BLUE, 8, 0.6)
  static readonly INNER_SHADOW = ShadowStyle.innerShadow()
}
