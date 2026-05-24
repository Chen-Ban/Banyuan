import Color from '../Color.js'
import Gradient, { type GradientStop } from './Gradient.js'
import { StyleType } from '@/foundation/constants'

/**
 * 径向渐变
 *
 * 从内圆向外圆方向分布色标的渐变类型。
 * 坐标系为百分比坐标（0-100），渲染时按实际宽高缩放。
 * (cx, cy) 为外圆圆心，r 为外圆半径。
 * 可选 (fx, fy, fr) 指定内圆（焦点）位置和半径，
 * 未指定时内圆退化为外圆圆心处的零半径圆。
 *
 * @example
 * ```ts
 * const gradient = new RadialGradient(50, 50, 50)
 * gradient.addStop(Color.WHITE, 0).addStop(Color.BLACK, 1)
 * const canvasGradient = gradient.createCanvasGradient(ctx, 200, 200)
 * ```
 */
export default class RadialGradient extends Gradient {
  readonly type: StyleType = StyleType.RADIAL_GRADIENT

  cx: number
  cy: number
  r: number
  fx?: number
  fy?: number
  fr?: number

  /**
   * 构造径向渐变实例
   *
   * 使用外圆参数、色标数组和可选的内圆参数初始化径向渐变。
   *
   * @param cx - 外圆圆心 x 坐标（百分比 0-100）
   * @param cy - 外圆圆心 y 坐标（百分比 0-100）
   * @param r - 外圆半径（百分比 0-100）
   * @param stops - 渐变色标数组
   * @param fx - 内圆（焦点）x 坐标（百分比 0-100，可选）
   * @param fy - 内圆（焦点）y 坐标（百分比 0-100，可选）
   * @param fr - 内圆半径（百分比 0-100，可选）
   * @returns 径向渐变实例
   *
   * @example
   * ```ts
   * // 基本径向渐变（从中心向外扩散）
   * const basic = new RadialGradient(50, 50, 50, [
   *   { color: Color.WHITE, position: 0 },
   *   { color: Color.BLACK, position: 1 }
   * ])
   *
   * // 带焦点偏移的径向渐变
   * const offset = new RadialGradient(50, 50, 50, [], 30, 30, 5)
   * ```
   */
  constructor(
    cx: number = 50, cy: number = 50, r: number = 50,
    stops: GradientStop[] = [],
    fx?: number, fy?: number, fr?: number
  ) {
    super(stops)
    this.cx = cx
    this.cy = cy
    this.r = r
    this.fx = fx
    this.fy = fy
    this.fr = fr
  }

  /**
   * 创建 Canvas 径向渐变对象
   *
   * 将百分比坐标转换为实际像素坐标，创建 CanvasGradient 并应用所有色标。
   * 若指定了内圆参数 (fx, fy, fr)，则使用双圆模式；否则内圆退化为圆心处零半径圆。
   *
   * @param ctx - Canvas 2D 渲染上下文
   * @param width - 绘制区域宽度（像素）
   * @param height - 绘制区域高度（像素）
   * @returns Canvas 原生径向渐变对象
   *
   * @example
   * ```ts
   * const canvasGradient = gradient.createCanvasGradient(ctx, 300, 300)
   * ctx.fillStyle = canvasGradient
   * ctx.fillRect(0, 0, 300, 300)
   * ```
   */
  createCanvasGradient(ctx: CanvasRenderingContext2D, width: number = 100, height: number = 100): CanvasGradient {
    const minDim = Math.min(width, height)
    let gradient: CanvasGradient

    if (this.fx !== undefined && this.fy !== undefined && this.fr !== undefined) {
      gradient = ctx.createRadialGradient(
        this.fx * width / 100,
        this.fy * height / 100,
        this.fr * minDim / 100,
        this.cx * width / 100,
        this.cy * height / 100,
        this.r * minDim / 100
      )
    } else {
      gradient = ctx.createRadialGradient(
        this.cx * width / 100,
        this.cy * height / 100,
        0,
        this.cx * width / 100,
        this.cy * height / 100,
        this.r * minDim / 100
      )
    }

    this.applyStops(gradient)
    return gradient
  }

  /**
   * 序列化为 JSON
   *
   * 将径向渐变实例转换为包含类型、色标和圆参数的 JSON 对象。
   *
   * @returns 可序列化的 JSON 对象
   *
   * @example
   * ```ts
   * const json = gradient.toJSON()
   * // { type: 'radialGradient', stops: [...], cx: 50, cy: 50, r: 50, fx: undefined, ... }
   * ```
   */
  toJSON(): any {
    return {
      type: this.type,
      stops: this.serializeStops(),
      cx: this.cx, cy: this.cy, r: this.r,
      fx: this.fx, fy: this.fy, fr: this.fr,
    }
  }

  /**
   * 从 JSON 反序列化
   *
   * 根据 JSON 数据还原径向渐变实例，包括外圆参数、内圆参数和色标。
   *
   * @param data - 包含渐变参数的 JSON 对象
   * @returns 还原后的 RadialGradient 实例
   *
   * @example
   * ```ts
   * const gradient = RadialGradient.fromJSON({
   *   cx: 50, cy: 50, r: 50,
   *   stops: [{ color: { r: 255, g: 255, b: 255, a: 1 }, position: 0 }]
   * })
   * ```
   */
  static fromJSON(data: any): RadialGradient {
    const stops = Gradient.deserializeStops(data.stops)
    return new RadialGradient(data.cx, data.cy, data.r, stops, data.fx, data.fy, data.fr)
  }

  /**
   * 复制径向渐变实例
   *
   * 创建当前径向渐变的深拷贝副本，包含相同的圆参数和色标。
   *
   * @returns 新的 RadialGradient 实例副本
   *
   * @example
   * ```ts
   * const copied = gradient.copy()
   * copied.addStop(Color.RED, 0.5) // 不影响原实例
   * ```
   */
  copy(): RadialGradient {
    return new RadialGradient(this.cx, this.cy, this.r, this.stops, this.fx, this.fy, this.fr)
  }

  /**
   * 比较径向渐变是否相等
   *
   * 判断当前径向渐变与另一个渐变是否在圆参数和色标上完全一致。
   *
   * @param other - 要比较的另一个渐变实例
   * @returns 两个渐变是否相等
   *
   * @example
   * ```ts
   * if (gradient1.equals(gradient2)) {
   *   console.log('两个径向渐变完全相同')
   * }
   * ```
   */
  equals(other: Gradient): boolean {
    if (!(other instanceof RadialGradient)) return false
    return this.cx === other.cx && this.cy === other.cy &&
           this.r === other.r &&
           this.fx === other.fx && this.fy === other.fy && this.fr === other.fr &&
           this.stopsEqual(other)
  }

  // 预定义径向渐变
  static readonly RADIAL_RAINBOW = new RadialGradient(50, 50, 50, [
    { color: Color.RED, position: 0 },
    { color: Color.YELLOW, position: 0.2 },
    { color: Color.GREEN, position: 0.4 },
    { color: Color.CYAN, position: 0.6 },
    { color: Color.BLUE, position: 0.8 },
    { color: Color.MAGENTA, position: 1 }
  ])

  static readonly FIRE = new RadialGradient(50, 50, 50, [
    { color: new Color(255, 255, 255), position: 0 },
    { color: new Color(255, 255, 0), position: 0.3 },
    { color: new Color(255, 100, 0), position: 0.7 },
    { color: new Color(139, 0, 0), position: 1 }
  ])
}
