import { STYLETYPE } from '@/foundation/constants'
import type { ISerializable } from '@/types'

export default class Color implements ISerializable {
  public readonly type: STYLETYPE = STYLETYPE.COLOR;
  private _r: number
  private _g: number
  private _b: number
  private _a: number

  constructor(r: number = 0, g: number = 0, b: number = 0, a: number = 1) {
    this._r = Math.max(0, Math.min(255, r))
    this._g = Math.max(0, Math.min(255, g))
    this._b = Math.max(0, Math.min(255, b))
    this._a = Math.max(0, Math.min(1, a))
  }

  // Getters
  get r(): number { return this._r }
  get g(): number { return this._g }
  get b(): number { return this._b }
  get a(): number { return this._a }

  // Setters
  set r(value: number) { this._r = Math.max(0, Math.min(255, value)) }
  set g(value: number) { this._g = Math.max(0, Math.min(255, value)) }
  set b(value: number) { this._b = Math.max(0, Math.min(255, value)) }
  set a(value: number) { this._a = Math.max(0, Math.min(1, value)) }

  // RGB to normalized RGB (0-1)
  get normalized(): { r: number, g: number, b: number, a: number } {
    return {
      r: this._r / 255,
      g: this._g / 255,
      b: this._b / 255,
      a: this._a
    }
  }

  // RGB to HSL
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

  // RGB to HSV
  get hsv(): { h: number, s: number, v: number, a: number } {
    const { r, g, b } = this.normalized
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const diff = max - min

    let h = 0
    const s = max === 0 ? 0 : diff / max
    const v = max

    if (diff !== 0) {
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
      v: v * 100,
      a: this._a
    }
  }

  // RGB to CMYK
  get cmyk(): { c: number, m: number, y: number, k: number, a: number } {
    const { r, g, b } = this.normalized
    const k = 1 - Math.max(r, g, b)
    
    if (k === 1) {
      return { c: 0, m: 0, y: 0, k: 100, a: this._a }
    }

    const c = (1 - r - k) / (1 - k)
    const m = (1 - g - k) / (1 - k)
    const y = (1 - b - k) / (1 - k)

    return {
      c: c * 100,
      m: m * 100,
      y: y * 100,
      k: k * 100,
      a: this._a
    }
  }

  // RGB to LAB
  get lab(): { l: number, a: number, b: number, alpha: number } {
    const { r, g, b } = this.normalized
    
    // RGB to XYZ
    const xyz = Color.rgbToXyz(r, g, b)
    
    // XYZ to LAB
    const lab = Color.xyzToLab(xyz.x, xyz.y, xyz.z)
    
    return {
      l: lab.l,
      a: lab.a,
      b: lab.b,
      alpha: this._a
    }
  }

  // RGB to HEX
  get hex(): string {
    const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0')
    return `#${toHex(this._r)}${toHex(this._g)}${toHex(this._b)}`
  }

  // RGB to RGBA string
  get rgba(): string {
    return `rgba(${Math.round(this._r)}, ${Math.round(this._g)}, ${Math.round(this._b)}, ${this._a})`
  }

  // RGB to HSLA string
  get hsla(): string {
    const { h, s, l, a } = this.hsl
    return `hsla(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%, ${a})`
  }

  // Static factory methods
  static fromHex(hex: string): Color {
    const cleanHex = hex.replace('#', '')
    const r = parseInt(cleanHex.substr(0, 2), 16)
    const g = parseInt(cleanHex.substr(2, 2), 16)
    const b = parseInt(cleanHex.substr(4, 2), 16)
    return new Color(r, g, b)
  }

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

  static fromHSV(h: number, s: number, v: number, a: number = 1): Color {
    h = h / 360
    s = s / 100
    v = v / 100

    const c = v * s
    const x = c * (1 - Math.abs((h * 6) % 2 - 1))
    const m = v - c

    let r, g, b

    if (h < 1/6) {
      r = c; g = x; b = 0
    } else if (h < 2/6) {
      r = x; g = c; b = 0
    } else if (h < 3/6) {
      r = 0; g = c; b = x
    } else if (h < 4/6) {
      r = 0; g = x; b = c
    } else if (h < 5/6) {
      r = x; g = 0; b = c
    } else {
      r = c; g = 0; b = x
    }

    return new Color((r + m) * 255, (g + m) * 255, (b + m) * 255, a)
  }

  static fromCMYK(c: number, m: number, y: number, k: number, a: number = 1): Color {
    c = c / 100
    m = m / 100
    y = y / 100
    k = k / 100

    const r = 255 * (1 - c) * (1 - k)
    const g = 255 * (1 - m) * (1 - k)
    const b = 255 * (1 - y) * (1 - k)

    return new Color(r, g, b, a)
  }

  static fromLAB(l: number, a: number, b: number, alpha: number = 1): Color {
    // LAB to XYZ
    const xyz = Color.labToXyz(l, a, b)
    
    // XYZ to RGB
    const rgb = Color.xyzToRgb(xyz.x, xyz.y, xyz.z)
    
    return new Color(rgb.r * 255, rgb.g * 255, rgb.b * 255, alpha)
  }

  // Color operations
  lighten(amount: number): Color {
    const { h, s, l, a } = this.hsl
    return Color.fromHSL(h, s, Math.min(100, l + amount), a)
  }

  darken(amount: number): Color {
    const { h, s, l, a } = this.hsl
    return Color.fromHSL(h, s, Math.max(0, l - amount), a)
  }

  saturate(amount: number): Color {
    const { h, s, l, a } = this.hsl
    return Color.fromHSL(h, Math.min(100, s + amount), l, a)
  }

  desaturate(amount: number): Color {
    const { h, s, l, a } = this.hsl
    return Color.fromHSL(h, Math.max(0, s - amount), l, a)
  }

  rotate(degrees: number): Color {
    const { h, s, l, a } = this.hsl
    return Color.fromHSL((h + degrees) % 360, s, l, a)
  }

  complement(): Color {
    return this.rotate(180)
  }

  // Color blending
  blend(other: Color, ratio: number = 0.5): Color {
    const r = this._r + (other._r - this._r) * ratio
    const g = this._g + (other._g - this._g) * ratio
    const b = this._b + (other._b - this._b) * ratio
    const a = this._a + (other._a - this._a) * ratio
    return new Color(r, g, b, a)
  }

  // ── 序列化 ──
  toJSON(): { r: number; g: number; b: number; a: number } {
    return { r: this._r, g: this._g, b: this._b, a: this._a }
  }

  static fromJSON(data: { r: number; g: number; b: number; a: number }): Color {
    return new Color(data.r, data.g, data.b, data.a)
  }

  // Utility methods
  copy(): Color {
    return new Color(this._r, this._g, this._b, this._a)
  }

  equals(other: Color): boolean {
    return this._r === other._r && 
           this._g === other._g && 
           this._b === other._b && 
           this._a === other._a
  }

  // Helper methods for color space conversions
  private static rgbToXyz(r: number, g: number, b: number): { x: number, y: number, z: number } {
    // Apply gamma correction
    const gammaCorrect = (c: number) => 
      c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92

    r = gammaCorrect(r)
    g = gammaCorrect(g)
    b = gammaCorrect(b)

    // Convert to XYZ using sRGB matrix
    const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375
    const y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750
    const z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041

    return { x, y, z }
  }

  private static xyzToLab(x: number, y: number, z: number): { l: number, a: number, b: number } {
    // D65 illuminant
    const xn = 0.95047
    const yn = 1.00000
    const zn = 1.08883

    x = x / xn
    y = y / yn
    z = z / zn

    const delta = 6/29
    const delta2 = delta * delta
    const delta3 = delta2 * delta

    const fx = x > delta3 ? Math.pow(x, 1/3) : (x / (3 * delta2)) + (4/29)
    const fy = y > delta3 ? Math.pow(y, 1/3) : (y / (3 * delta2)) + (4/29)
    const fz = z > delta3 ? Math.pow(z, 1/3) : (z / (3 * delta2)) + (4/29)

    const l = 116 * fy - 16
    const a = 500 * (fx - fy)
    const b = 200 * (fy - fz)

    return { l, a, b }
  }

  private static labToXyz(l: number, a: number, b: number): { x: number, y: number, z: number } {
    const fy = (l + 16) / 116
    const fx = a / 500 + fy
    const fz = fy - b / 200

    const delta = 6/29
    const delta2 = delta * delta

    const x = fx > delta ? Math.pow(fx, 3) : 3 * delta2 * (fx - 4/29)
    const y = fy > delta ? Math.pow(fy, 3) : 3 * delta2 * (fy - 4/29)
    const z = fz > delta ? Math.pow(fz, 3) : 3 * delta2 * (fz - 4/29)

    // D65 illuminant
    const xn = 0.95047
    const yn = 1.00000
    const zn = 1.08883

    return { x: x * xn, y: y * yn, z: z * zn }
  }

  private static xyzToRgb(x: number, y: number, z: number): { r: number, g: number, b: number } {
    // Convert XYZ to RGB using sRGB matrix
    let r = x * 3.2404542 + y * -1.5371385 + z * -0.4985314
    let g = x * -0.9692660 + y * 1.8760108 + z * 0.0415560
    let b = x * 0.0556434 + y * -0.2040259 + z * 1.0572252

    // Apply gamma correction
    const gammaCorrect = (c: number) => 
      c > 0.0031308 ? 1.055 * Math.pow(c, 1/2.4) - 0.055 : 12.92 * c

    r = Math.max(0, Math.min(1, gammaCorrect(r)))
    g = Math.max(0, Math.min(1, gammaCorrect(g)))
    b = Math.max(0, Math.min(1, gammaCorrect(b)))

    return { r, g, b }
  }

  // Predefined colors
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
