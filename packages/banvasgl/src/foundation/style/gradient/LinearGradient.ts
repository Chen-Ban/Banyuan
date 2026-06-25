import Color from '../Color.js'
import Gradient from './Gradient.js'
import type { GradientStop } from '@/types/foundation/style'
import { StyleType } from '@/foundation/constants'
import type { IDrawingContext } from '@/types/platform/context.js'
import type { IGradient } from '@/types/foundation/gradient.js'

/**
 * 线性渐变
 *
 * 沿两点连线方向分布色标的渐变类型。
 * 坐标系为百分比坐标（0-100），渲染时按实际宽高缩放。
 * (x0, y0) 为渐变起点，(x1, y1) 为渐变终点。
 *
 * @example
 * ```ts
 * const gradient = new LinearGradient(0, 0, 100, 0)
 * gradient.addStop(Color.RED, 0).addStop(Color.BLUE, 1)
 * const canvasGradient = gradient.createCanvasGradient(ctx, 200, 100)
 * ```
 */
export default class LinearGradient extends Gradient {
  readonly type: StyleType = StyleType.LINEAR_GRADIENT

  x0: number
  y0: number
  x1: number
  y1: number

  /**
   * 构造线性渐变实例
   *
   * 使用起点和终点的百分比坐标以及色标数组初始化线性渐变。
   *
   * @param x0 - 渐变起点 x 坐标（百分比 0-100）
   * @param y0 - 渐变起点 y 坐标（百分比 0-100）
   * @param x1 - 渐变终点 x 坐标（百分比 0-100）
   * @param y1 - 渐变终点 y 坐标（百分比 0-100）
   * @param stops - 渐变色标数组
   * @returns 线性渐变实例
   *
   * @example
   * ```ts
   * const gradient = new LinearGradient(0, 0, 100, 100, [
   *   { color: Color.RED, position: 0 },
   *   { color: Color.BLUE, position: 1 }
   * ])
   * ```
   */
  constructor(x0: number = 0, y0: number = 0, x1: number = 100, y1: number = 0, stops: GradientStop[] = []) {
    super(stops)
    this.x0 = x0
    this.y0 = y0
    this.x1 = x1
    this.y1 = y1
  }

  /**
   * 设置渐变方向
   *
   * 更新渐变的起点和终点坐标，坐标值会被限制在 0-100 范围内。
   *
   * @param x0 - 新的起点 x 坐标（百分比 0-100）
   * @param y0 - 新的起点 y 坐标（百分比 0-100）
   * @param x1 - 新的终点 x 坐标（百分比 0-100）
   * @param y1 - 新的终点 y 坐标（百分比 0-100）
   * @returns 当前渐变实例（支持链式调用）
   *
   * @example
   * ```ts
   * gradient.setDirection(0, 0, 0, 100) // 改为从上到下
   * ```
   */
  setDirection(x0: number, y0: number, x1: number, y1: number): this {
    this.x0 = Math.max(0, Math.min(100, x0))
    this.y0 = Math.max(0, Math.min(100, y0))
    this.x1 = Math.max(0, Math.min(100, x1))
    this.y1 = Math.max(0, Math.min(100, y1))
    return this
  }

  /**
   * 创建 Canvas 线性渐变对象
   *
   * 将百分比坐标转换为实际像素坐标，创建 CanvasGradient 并应用所有色标。
   *
   * @param ctx - Canvas 2D 渲染上下文
   * @param width - 绘制区域宽度（像素）
   * @param height - 绘制区域高度（像素）
   * @returns Canvas 原生线性渐变对象
   *
   * @example
   * ```ts
   * const canvasGradient = gradient.createCanvasGradient(ctx, 300, 200)
   * ctx.fillStyle = canvasGradient
   * ctx.fillRect(0, 0, 300, 200)
   * ```
   */
  createCanvasGradient(ctx: IDrawingContext, width: number = 100, height: number = 100): IGradient {
    const gradient = ctx.createLinearGradient(
      this.x0 * width / 100,
      this.y0 * height / 100,
      this.x1 * width / 100,
      this.y1 * height / 100
    )
    this.applyStops(gradient)
    return gradient
  }

  /**
   * 序列化为 JSON
   *
   * 将线性渐变实例转换为包含类型、色标和方向坐标的 JSON 对象。
   *
   * @returns 可序列化的 JSON 对象
   *
   * @example
   * ```ts
   * const json = gradient.toJSON()
   * // { type: 'linearGradient', stops: [...], x0: 0, y0: 0, x1: 100, y1: 0 }
   * ```
   */
  toJSON(): any {
    return {
      type: this.type,
      stops: this.serializeStops(),
      x0: this.x0, y0: this.y0, x1: this.x1, y1: this.y1,
    }
  }

  /**
   * 从 JSON 反序列化
   *
   * 根据 JSON 数据还原线性渐变实例，包括方向坐标和色标。
   *
   * @param data - 包含渐变参数的 JSON 对象
   * @returns 还原后的 LinearGradient 实例
   *
   * @example
   * ```ts
   * const gradient = LinearGradient.fromJSON({
   *   x0: 0, y0: 0, x1: 100, y1: 0,
   *   stops: [{ color: { r: 255, g: 0, b: 0, a: 1 }, position: 0 }]
   * })
   * ```
   */
  static fromJSON(data: any): LinearGradient {
    const stops = Gradient.deserializeStops(data.stops)
    return new LinearGradient(data.x0, data.y0, data.x1, data.y1, stops)
  }

  /**
   * 复制线性渐变实例
   *
   * 创建当前线性渐变的深拷贝副本，包含相同的方向坐标和色标。
   *
   * @returns 新的 LinearGradient 实例副本
   *
   * @example
   * ```ts
   * const copied = gradient.copy()
   * copied.setDirection(0, 0, 0, 100) // 不影响原实例
   * ```
   */
  copy(): LinearGradient {
    return new LinearGradient(this.x0, this.y0, this.x1, this.y1, this.stops)
  }

  /**
   * 比较线性渐变是否相等
   *
   * 判断当前线性渐变与另一个渐变是否在方向坐标和色标上完全一致。
   *
   * @param other - 要比较的另一个渐变实例
   * @returns 两个渐变是否相等
   *
   * @example
   * ```ts
   * if (gradient1.equals(gradient2)) {
   *   console.log('两个线性渐变完全相同')
   * }
   * ```
   */
  equals(other: Gradient): boolean {
    if (!(other instanceof LinearGradient)) return false
    return this.x0 === other.x0 && this.y0 === other.y0 &&
           this.x1 === other.x1 && this.y1 === other.y1 &&
           this.stopsEqual(other)
  }

  // 预定义线性渐变
  static readonly HORIZONTAL_RAINBOW = new LinearGradient(0, 0, 100, 0, [
    { color: Color.RED, position: 0 },
    { color: Color.YELLOW, position: 0.2 },
    { color: Color.GREEN, position: 0.4 },
    { color: Color.CYAN, position: 0.6 },
    { color: Color.BLUE, position: 0.8 },
    { color: Color.MAGENTA, position: 1 }
  ])

  static readonly VERTICAL_RAINBOW = new LinearGradient(0, 0, 0, 100, [
    { color: Color.RED, position: 0 },
    { color: Color.YELLOW, position: 0.2 },
    { color: Color.GREEN, position: 0.4 },
    { color: Color.CYAN, position: 0.6 },
    { color: Color.BLUE, position: 0.8 },
    { color: Color.MAGENTA, position: 1 }
  ])

  static readonly DIAGONAL_RAINBOW = new LinearGradient(0, 0, 100, 100, [
    { color: Color.RED, position: 0 },
    { color: Color.YELLOW, position: 0.2 },
    { color: Color.GREEN, position: 0.4 },
    { color: Color.CYAN, position: 0.6 },
    { color: Color.BLUE, position: 0.8 },
    { color: Color.MAGENTA, position: 1 }
  ])

  static readonly SUNSET = new LinearGradient(0, 0, 0, 100, [
    { color: new Color(255, 94, 77), position: 0 },
    { color: new Color(255, 154, 0), position: 0.5 },
    { color: new Color(255, 206, 84), position: 1 }
  ])

  static readonly OCEAN = new LinearGradient(0, 0, 0, 100, [
    { color: new Color(0, 119, 190), position: 0 },
    { color: new Color(0, 180, 216), position: 0.5 },
    { color: new Color(144, 224, 239), position: 1 }
  ])
}
