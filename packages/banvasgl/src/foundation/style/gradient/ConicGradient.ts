import Gradient from './Gradient.js'
import type { GradientStop } from '@/types/foundation/style'
import { StyleType } from '@/foundation/constants'
import type { IDrawingContext } from '@/types/platform/context.js'
import type { IGradient } from '@/types/foundation/gradient.js'

/**
 * 圆锥渐变（角度渐变）
 *
 * 以指定中心点为圆心，沿角度方向分布色标的渐变类型。
 * 坐标系为百分比坐标（0-100），角度单位为弧度。
 * Canvas 2D 原生支持 createConicGradient（Chrome 99+），
 * 对于不支持的环境会退化为径向渐变近似。
 *
 * @example
 * ```ts
 * const gradient = new ConicGradient(0, 50, 50)
 * gradient.addStop(Color.RED, 0).addStop(Color.BLUE, 1)
 * const canvasGradient = gradient.createCanvasGradient(ctx, 200, 200)
 * ```
 */
export default class ConicGradient extends Gradient {
  readonly type: StyleType = StyleType.CONIC_GRADIENT

  /** 起始角度（弧度） */
  angle: number
  /** 圆心 x 坐标（百分比 0-100） */
  cx: number
  /** 圆心 y 坐标（百分比 0-100） */
  cy: number

  /**
   * 构造圆锥渐变实例
   *
   * 使用起始角度、圆心坐标和色标数组初始化圆锥渐变。
   *
   * @param angle - 起始角度（弧度），默认为 0
   * @param cx - 圆心 x 坐标（百分比 0-100），默认为 50
   * @param cy - 圆心 y 坐标（百分比 0-100），默认为 50
   * @param stops - 渐变色标数组
   * @returns 圆锥渐变实例
   *
   * @example
   * ```ts
   * const gradient = new ConicGradient(Math.PI / 4, 50, 50, [
   *   { color: Color.RED, position: 0 },
   *   { color: Color.GREEN, position: 0.5 },
   *   { color: Color.BLUE, position: 1 }
   * ])
   * ```
   */
  constructor(angle: number = 0, cx: number = 50, cy: number = 50, stops: GradientStop[] = []) {
    super(stops)
    this.angle = angle
    this.cx = cx
    this.cy = cy
  }

  /**
   * 创建 Canvas 圆锥渐变对象
   *
   * 将百分比坐标转换为实际像素坐标，优先使用原生 createConicGradient API，
   * 若运行环境不支持则降级为径向渐变近似，并应用所有色标。
   *
   * @param ctx - Canvas 2D 渲染上下文
   * @param width - 绘制区域宽度（像素）
   * @param height - 绘制区域高度（像素）
   * @returns Canvas 原生渐变对象（圆锥或降级后的径向）
   *
   * @example
   * ```ts
   * const canvasGradient = gradient.createCanvasGradient(ctx, 300, 300)
   * ctx.fillStyle = canvasGradient
   * ctx.beginPath()
   * ctx.arc(150, 150, 150, 0, Math.PI * 2)
   * ctx.fill()
   * ```
   */
  createCanvasGradient(ctx: IDrawingContext, width: number = 100, height: number = 100): IGradient {
    const centerX = (this.cx * width) / 100
    const centerY = (this.cy * height) / 100

    // createConicGradient 在 Chrome 99+ / Firefox 113+ / Safari 16.1+ 中已原生支持
    // 若运行环境不支持，降级为径向渐变近似
    const anyCtx = ctx as any
    let gradient: CanvasGradient

    if (typeof anyCtx.createConicGradient === 'function') {
      gradient = anyCtx.createConicGradient(this.angle, centerX, centerY)
    } else {
      gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.min(width, height) / 2)
    }

    this.applyStops(gradient)
    return gradient
  }

  /**
   * 序列化为 JSON
   *
   * 将圆锥渐变实例转换为包含类型、色标、角度和圆心坐标的 JSON 对象。
   *
   * @returns 可序列化的 JSON 对象
   *
   * @example
   * ```ts
   * const json = gradient.toJSON()
   * // { type: 'conicGradient', stops: [...], angle: 0, cx: 50, cy: 50 }
   * ```
   */
  toJSON(): any {
    return {
      type: this.type,
      stops: this.serializeStops(),
      angle: this.angle,
      cx: this.cx,
      cy: this.cy,
    }
  }

  /**
   * 从 JSON 反序列化
   *
   * 根据 JSON 数据还原圆锥渐变实例，包括角度、圆心坐标和色标。
   *
   * @param data - 包含渐变参数的 JSON 对象
   * @returns 还原后的 ConicGradient 实例
   *
   * @example
   * ```ts
   * const gradient = ConicGradient.fromJSON({
   *   angle: 0, cx: 50, cy: 50,
   *   stops: [{ color: { r: 255, g: 0, b: 0, a: 1 }, position: 0 }]
   * })
   * ```
   */
  static fromJSON(data: any): ConicGradient {
    const stops = Gradient.deserializeStops(data.stops)
    return new ConicGradient(data.angle, data.cx, data.cy, stops)
  }

  /**
   * 复制圆锥渐变实例
   *
   * 创建当前圆锥渐变的深拷贝副本，包含相同的角度、圆心坐标和色标。
   *
   * @returns 新的 ConicGradient 实例副本
   *
   * @example
   * ```ts
   * const copied = gradient.copy()
   * copied.addStop(Color.YELLOW, 0.5) // 不影响原实例
   * ```
   */
  copy(): ConicGradient {
    return new ConicGradient(this.angle, this.cx, this.cy, this.stops)
  }

  /**
   * 比较圆锥渐变是否相等
   *
   * 判断当前圆锥渐变与另一个渐变是否在角度、圆心坐标和色标上完全一致。
   *
   * @param other - 要比较的另一个渐变实例
   * @returns 两个渐变是否相等
   *
   * @example
   * ```ts
   * if (gradient1.equals(gradient2)) {
   *   console.log('两个圆锥渐变完全相同')
   * }
   * ```
   */
  equals(other: Gradient): boolean {
    if (!(other instanceof ConicGradient)) return false
    return (
      this.angle === other.angle && this.cx === other.cx && this.cy === other.cy && this.stopsEqual(other)
    )
  }
}
