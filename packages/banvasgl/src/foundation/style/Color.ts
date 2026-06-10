import { StyleType } from '@/foundation/constants'
import type { ISerializable } from '@/types/foundation/serializable'

/**
 * RGBA 颜色
 *
 * 表示一个 RGBA 颜色值，各通道范围：r/g/b ∈ [0, 255]，a ∈ [0, 1]。
 * 支持 RGB、HSL、HEX 格式互转，以及常用颜色操作（提亮、加深、饱和、混合等）。
 * 构造时自动 clamp 到合法范围。
 *
 * @example
 * ```ts
 * const red = Color.fromHex('#f00')
 * const lighter = red.lighten(20)
 * const blended = red.blend(Color.BLUE, 0.5)
 * ```
 */
export default class Color implements ISerializable {
  public readonly type: StyleType = StyleType.COLOR;
  private _r: number
  private _g: number
  private _b: number
  private _a: number

  /**
   * 构造颜色
   *
   * 创建一个 RGBA 颜色实例，各通道值会被自动 clamp 到合法范围。
   *
   * @param r - 红色通道，范围 [0, 255]，默认 0
   * @param g - 绿色通道，范围 [0, 255]，默认 0
   * @param b - 蓝色通道，范围 [0, 255]，默认 0
   * @param a - 透明度，范围 [0, 1]，默认 1（完全不透明）
   *
   * @example
   * ```ts
   * const red = new Color(255, 0, 0)
   * const semiTransparentBlue = new Color(0, 0, 255, 0.5)
   * ```
   */
  constructor(r: number = 0, g: number = 0, b: number = 0, a: number = 1) {
    this._r = Math.max(0, Math.min(255, r))
    this._g = Math.max(0, Math.min(255, g))
    this._b = Math.max(0, Math.min(255, b))
    this._a = Math.max(0, Math.min(1, a))
  }

  get r(): number { return this._r }
  get g(): number { return this._g }
  get b(): number { return this._b }
  get a(): number { return this._a }

  set r(value: number) { this._r = Math.max(0, Math.min(255, value)) }
  set g(value: number) { this._g = Math.max(0, Math.min(255, value)) }
  set b(value: number) { this._b = Math.max(0, Math.min(255, value)) }
  set a(value: number) { this._a = Math.max(0, Math.min(1, value)) }

  /**
   * 获取归一化颜色
   *
   * 将 RGB 各通道从 [0, 255] 映射到 [0, 1]，透明度保持不变。
   *
   * @returns 归一化后的 RGBA 对象，各通道 ∈ [0, 1]
   *
   * @example
   * ```ts
   * const c = new Color(128, 64, 255)
   * const { r, g, b, a } = c.normalized // r ≈ 0.502, g ≈ 0.251, b = 1
   * ```
   */
  get normalized(): { r: number, g: number, b: number, a: number } {
    return {
      r: this._r / 255,
      g: this._g / 255,
      b: this._b / 255,
      a: this._a
    }
  }

  /**
   * 转换为 HSL 色彩空间
   *
   * 将当前 RGB 颜色转换为 HSL（色相/饱和度/亮度）表示。
   *
   * @returns HSL 对象：h ∈ [0, 360]，s ∈ [0, 100]，l ∈ [0, 100]，a ∈ [0, 1]
   *
   * @example
   * ```ts
   * const red = new Color(255, 0, 0)
   * const { h, s, l } = red.hsl // h = 0, s = 100, l = 50
   * ```
   */
  get hsl(): { h: number, s: number, l: number, a: number } {
    const { r, g, b } = this.normalized
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const diff = max - min

    let h = 0
    let s = 0
    const l = (max + min) / 2

    if (diff !== 0) {
      s = l > 0.5 ? diff / (2 - max - min) : diff / (max + min)

      switch (max) {
        case r:
          h = (g - b) / diff + (g < b ? 6 : 0)
          break
        case g:
          h = (b - r) / diff + 2
          break
        case b:
          h = (r - g) / diff + 4
          break
      }
      h /= 6
    }

    return {
      h: h * 360,
      s: s * 100,
      l: l * 100,
      a: this._a
    }
  }

  /**
   * 获取 HEX 字符串
   *
   * 返回 6 位十六进制颜色字符串（不含透明度）。
   *
   * @returns 格式为 `#rrggbb` 的字符串
   *
   * @example
   * ```ts
   * new Color(255, 128, 0).hex // '#ff8000'
   * ```
   */
  get hex(): string {
    const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0')
    return `#${toHex(this._r)}${toHex(this._g)}${toHex(this._b)}`
  }

  /**
   * 获取 CSS rgba 字符串
   *
   * 返回可直接用于 CSS/Canvas 的 rgba() 函数字符串。
   *
   * @returns 格式为 `rgba(r, g, b, a)` 的字符串
   *
   * @example
   * ```ts
   * new Color(255, 0, 0, 0.5).rgba // 'rgba(255, 0, 0, 0.5)'
   * ```
   */
  get rgba(): string {
    return `rgba(${Math.round(this._r)}, ${Math.round(this._g)}, ${Math.round(this._b)}, ${this._a})`
  }

  /**
   * 获取 CSS hsla 字符串
   *
   * 返回可直接用于 CSS 的 hsla() 函数字符串。
   *
   * @returns 格式为 `hsla(h, s%, l%, a)` 的字符串
   *
   * @example
   * ```ts
   * new Color(255, 0, 0).hsla // 'hsla(0, 100%, 50%, 1)'
   * ```
   */
  get hsla(): string {
    const { h, s, l, a } = this.hsl
    return `hsla(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%, ${a})`
  }

  /**
   * 从 HEX 创建颜色
   *
   * 解析十六进制颜色字符串，支持 3/4/6/8 位格式，# 符号可省略。
   * 3 位自动扩展为 6 位（如 `#f00` → `#ff0000`），4 位同理含透明度。
   *
   * @param hex - 十六进制颜色字符串，如 `'#ff0000'`、`'f00'`、`'#rgba'`
   * @returns 对应的 Color 实例
   *
   * @example
   * ```ts
   * const red = Color.fromHex('#f00')       // 简写
   * const blue = Color.fromHex('0000ff')    // 无 # 号
   * const semi = Color.fromHex('#ff000080') // 含透明度
   * ```
   */
  static fromHex(hex: string): Color {
    let h = hex.replace('#', '')
    // 支持简写形式：#RGB / #RGBA → #RRGGBB / #RRGGBBAA
    if (h.length === 3 || h.length === 4) {
      h = h.split('').map(c => c + c).join('')
    }
    const r = parseInt(h.substring(0, 2), 16)
    const g = parseInt(h.substring(2, 4), 16)
    const b = parseInt(h.substring(4, 6), 16)
    const a = h.length === 8 ? parseInt(h.substring(6, 8), 16) / 255 : 1
    return new Color(r, g, b, a)
  }

  /**
   * 从 CSS 色值字符串创建颜色
   *
   * 支持多种 CSS 格式：
   * - 十六进制：`'#ff0000'`、`'#f00'`、`'#ff000080'`
   * - rgb：`'rgb(255, 0, 0)'`
   * - rgba：`'rgba(255, 0, 0, 0.5)'`
   * - 颜色关键字：`'transparent'`、`'white'`、`'black'`（仅支持常用关键字）
   *
   * 无法解析时回退到黑色（Color.BLACK），不抛出异常。
   *
   * @param css - CSS 色值字符串
   * @returns 对应的 Color 实例
   *
   * @example
   * ```ts
   * Color.fromCSSString('#3498db')           // hex
   * Color.fromCSSString('rgba(255,0,0,0.5)') // rgba
   * Color.fromCSSString('transparent')       // 透明
   * ```
   */
  static fromCSSString(css: string): Color {
    const s = css.trim().toLowerCase()

    // 颜色关键字
    if (s === 'transparent') return new Color(0, 0, 0, 0)
    if (s === 'white')       return Color.WHITE
    if (s === 'black')       return Color.BLACK
    if (s === 'red')         return Color.RED
    if (s === 'green')       return Color.GREEN
    if (s === 'blue')        return Color.BLUE

    // hex
    if (s.startsWith('#')) {
      try { return Color.fromHex(s) } catch { /* fall through */ }
    }

    // rgba(r, g, b, a)
    const rgbaMatch = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/)
    if (rgbaMatch) {
      const r = parseFloat(rgbaMatch[1])
      const g = parseFloat(rgbaMatch[2])
      const b = parseFloat(rgbaMatch[3])
      const a = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1
      return new Color(r, g, b, a)
    }

    // 无法解析，回退黑色
    return Color.BLACK
  }

  /**
   * 从 HSL 创建颜色
   *
   * 将 HSL 色彩空间的值转换为 RGB 并创建 Color 实例。
   *
   * @param h - 色相，范围 [0, 360]
   * @param s - 饱和度，范围 [0, 100]
   * @param l - 亮度，范围 [0, 100]
   * @param a - 透明度，范围 [0, 1]，默认 1
   * @returns 对应的 Color 实例
   *
   * @example
   * ```ts
   * const red = Color.fromHSL(0, 100, 50)      // 纯红
   * const sky = Color.fromHSL(200, 80, 60, 0.8) // 半透明天蓝
   * ```
   */
  static fromHSL(h: number, s: number, l: number, a: number = 1): Color {
    h = h / 360
    s = s / 100
    l = l / 100

    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1/6) return p + (q - p) * 6 * t
      if (t < 1/2) return q
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
      return p
    }

    let r, g, b

    if (s === 0) {
      r = g = b = l
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s
      const p = 2 * l - q
      r = hue2rgb(p, q, h + 1/3)
      g = hue2rgb(p, q, h)
      b = hue2rgb(p, q, h - 1/3)
    }

    return new Color(r * 255, g * 255, b * 255, a)
  }

  /**
   * 提亮颜色
   *
   * 在 HSL 色彩空间中增加亮度值，返回新的 Color 实例。
   *
   * @param amount - HSL 亮度增量（0-100 范围内的绝对值增量）
   * @returns 提亮后的新 Color 实例
   *
   * @example
   * ```ts
   * const dark = Color.fromHex('#333')
   * const lighter = dark.lighten(30) // 亮度 +30
   * ```
   */
  lighten(amount: number): Color {
    const { h, s, l, a } = this.hsl
    return Color.fromHSL(h, s, Math.min(100, l + amount), a)
  }

  /**
   * 加深颜色
   *
   * 在 HSL 色彩空间中降低亮度值，返回新的 Color 实例。
   *
   * @param amount - HSL 亮度减量（0-100 范围内的绝对值减量）
   * @returns 加深后的新 Color 实例
   *
   * @example
   * ```ts
   * const light = Color.fromHex('#ccc')
   * const darker = light.darken(20) // 亮度 -20
   * ```
   */
  darken(amount: number): Color {
    const { h, s, l, a } = this.hsl
    return Color.fromHSL(h, s, Math.max(0, l - amount), a)
  }

  /**
   * 增加饱和度
   *
   * 在 HSL 色彩空间中增加饱和度值，使颜色更鲜艳。
   *
   * @param amount - HSL 饱和度增量（0-100 范围内的绝对值增量）
   * @returns 饱和度增加后的新 Color 实例
   *
   * @example
   * ```ts
   * const muted = Color.fromHSL(200, 30, 50)
   * const vivid = muted.saturate(40) // 饱和度 → 70
   * ```
   */
  saturate(amount: number): Color {
    const { h, s, l, a } = this.hsl
    return Color.fromHSL(h, Math.min(100, s + amount), l, a)
  }

  /**
   * 降低饱和度
   *
   * 在 HSL 色彩空间中降低饱和度值，使颜色更灰暗。
   *
   * @param amount - HSL 饱和度减量（0-100 范围内的绝对值减量）
   * @returns 饱和度降低后的新 Color 实例
   *
   * @example
   * ```ts
   * const vivid = Color.fromHSL(200, 90, 50)
   * const grey = vivid.desaturate(60) // 饱和度 → 30
   * ```
   */
  desaturate(amount: number): Color {
    const { h, s, l, a } = this.hsl
    return Color.fromHSL(h, Math.max(0, s - amount), l, a)
  }

  /**
   * 色相旋转
   *
   * 在色轮上旋转指定角度，返回新的 Color 实例。
   *
   * @param degrees - 旋转角度（度），正值顺时针
   * @returns 色相旋转后的新 Color 实例
   *
   * @example
   * ```ts
   * const red = Color.fromHex('#f00')
   * const green = red.rotate(120) // 色相 0 → 120（绿色）
   * ```
   */
  rotate(degrees: number): Color {
    const { h, s, l, a } = this.hsl
    return Color.fromHSL((h + degrees) % 360, s, l, a)
  }

  /**
   * 获取互补色
   *
   * 返回色相旋转 180° 后的颜色（色轮对面的颜色）。
   *
   * @returns 互补色的新 Color 实例
   *
   * @example
   * ```ts
   * const red = Color.fromHex('#f00')
   * const cyan = red.complement() // 互补色：青色
   * ```
   */
  complement(): Color {
    return this.rotate(180)
  }

  /**
   * 颜色混合
   *
   * 将当前颜色与目标颜色按比例线性插值混合。
   *
   * @param other - 目标颜色
   * @param ratio - 混合比例，0 = 完全当前色，1 = 完全目标色，默认 0.5
   * @returns 混合后的新 Color 实例
   *
   * @example
   * ```ts
   * const purple = Color.RED.blend(Color.BLUE, 0.5) // 红蓝各半 → 紫色
   * const nearRed = Color.RED.blend(Color.BLUE, 0.2) // 偏红
   * ```
   */
  blend(other: Color, ratio: number = 0.5): Color {
    const r = this._r + (other._r - this._r) * ratio
    const g = this._g + (other._g - this._g) * ratio
    const b = this._b + (other._b - this._b) * ratio
    const a = this._a + (other._a - this._a) * ratio
    return new Color(r, g, b, a)
  }

  /**
   * 序列化为 JSON
   *
   * 将颜色转换为可序列化的纯对象，配合 Serializer 使用。
   *
   * @returns 包含 r/g/b/a 的纯对象
   *
   * @example
   * ```ts
   * const json = Color.RED.toJSON() // { r: 255, g: 0, b: 0, a: 1 }
   * ```
   */
  toJSON(): { r: number; g: number; b: number; a: number } {
    return { r: this._r, g: this._g, b: this._b, a: this._a }
  }

  /**
   * 从 JSON 反序列化
   *
   * 从 toJSON() 产生的纯对象还原 Color 实例。
   *
   * @param data - 包含 r/g/b/a 的纯对象
   * @returns 还原的 Color 实例
   *
   * @example
   * ```ts
   * const color = Color.fromJSON({ r: 255, g: 0, b: 0, a: 1 })
   * ```
   */
  static fromJSON(data: { r: number; g: number; b: number; a: number } | null | undefined): Color {
    // 容错：color 数据缺失时回退到黑色，避免反序列化时整棵 appJSON 崩溃。
    // Color.fromJSON 是 FillStyle / ShadowStyle / TextOptions / 渐变色标等多处反序列化的叶子节点，
    // 任一处 color 字段缺失都不应导致整页白屏。
    if (!data) {
      return new Color(0, 0, 0, 1)
    }
    return new Color(data.r, data.g, data.b, data.a)
  }

  /**
   * 深拷贝
   *
   * 创建当前颜色的独立副本，修改副本不影响原对象。
   *
   * @returns 新的 Color 实例，值与当前相同
   *
   * @example
   * ```ts
   * const original = Color.RED
   * const cloned = original.copy()
   * cloned.r = 128 // original.r 仍为 255
   * ```
   */
  copy(): Color {
    return new Color(this._r, this._g, this._b, this._a)
  }

  /**
   * 判断相等
   *
   * 逐通道精确比较两个颜色是否完全相同。
   *
   * @param other - 待比较的颜色
   * @returns 所有通道均相等时返回 true
   *
   * @example
   * ```ts
   * Color.RED.equals(new Color(255, 0, 0)) // true
   * Color.RED.equals(Color.BLUE)           // false
   * ```
   */
  equals(other: Color): boolean {
    return this._r === other._r && 
           this._g === other._g && 
           this._b === other._b && 
           this._a === other._a
  }

  // ── 预定义颜色 ──
  static readonly RED = new Color(255, 0, 0)
  static readonly GREEN = new Color(0, 255, 0)
  static readonly BLUE = new Color(0, 0, 255)
  static readonly WHITE = new Color(255, 255, 255)
  static readonly BLACK = new Color(0, 0, 0)
  static readonly GRAY = new Color(128, 128, 128)
  static readonly YELLOW = new Color(255, 255, 0)
  static readonly CYAN = new Color(0, 255, 255)
  static readonly MAGENTA = new Color(255, 0, 255)
  static readonly ORANGE = new Color(255, 165, 0)
  static readonly PINK = new Color(255, 192, 203)
  static readonly PURPLE = new Color(128, 0, 128)
  static readonly BROWN = new Color(165, 42, 42)
  static readonly LIME = new Color(0, 255, 0)
  static readonly NAVY = new Color(0, 0, 128)
  static readonly TEAL = new Color(0, 128, 128)
  static readonly SILVER = new Color(192, 192, 192)
  static readonly GOLD = new Color(255, 215, 0)
  static readonly TRANSPARENT = new Color(0, 0, 0, 0)
}
