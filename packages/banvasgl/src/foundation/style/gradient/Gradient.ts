import Color from '../Color.js'
import { StyleType } from '@/foundation/constants'
import type { ISerializable } from '@/types/foundation/serializable'
import type { IDrawingContext } from '@/types/platform/drawing.js'
import type { IGradient } from '@/types/foundation/gradient.js'

export type GradientStop = {
  color: Color
  position: number // 0-1
}

/**
 * 渐变抽象基类
 *
 * 定义所有渐变类型共享的色标管理和序列化契约。
 * 具体的渐变几何参数和 Canvas 渲染逻辑由子类实现。
 *
 * @example
 * ```ts
 * // 子类继承 Gradient 并实现抽象方法
 * class MyGradient extends Gradient {
 *   readonly type = StyleType.LINEAR_GRADIENT
 *   createCanvasGradient(ctx, width, height) { ... }
 *   toJSON() { ... }
 *   copy() { ... }
 *   equals(other) { ... }
 * }
 * ```
 */
export default abstract class Gradient implements ISerializable {
  abstract readonly type: StyleType
  stops: GradientStop[]

  /**
   * 构造渐变实例
   *
   * 使用给定的色标数组初始化渐变对象，色标数组会被浅拷贝以避免外部修改。
   *
   * @param stops - 渐变色标数组，每个色标包含颜色和位置（0-1）
   * @returns 渐变实例
   *
   * @example
   * ```ts
   * const gradient = new MyGradient([
   *   { color: Color.RED, position: 0 },
   *   { color: Color.BLUE, position: 1 }
   * ])
   * ```
   */
  constructor(stops: GradientStop[] = []) {
    this.stops = [...stops]
  }

  /**
   * 添加颜色停止点
   *
   * 向渐变中添加一个新的色标，位置会被限制在 0-1 范围内，
   * 添加后色标数组会按位置升序重新排序。
   *
   * @param color - 色标颜色
   * @param position - 色标位置，取值范围 0-1，超出范围会被截断
   * @returns 当前渐变实例（支持链式调用）
   *
   * @example
   * ```ts
   * gradient.addStop(Color.RED, 0).addStop(Color.BLUE, 1)
   * ```
   */
  addStop(color: Color, position: number): this {
    const stop: GradientStop = { color, position: Math.max(0, Math.min(1, position)) }
    this.stops.push(stop)
    this.stops.sort((a, b) => a.position - b.position)
    return this
  }

  /**
   * 移除颜色停止点
   *
   * 根据索引移除指定位置的色标，索引越界时不做任何操作。
   *
   * @param index - 要移除的色标索引（从 0 开始）
   * @returns 当前渐变实例（支持链式调用）
   *
   * @example
   * ```ts
   * gradient.removeStop(0) // 移除第一个色标
   * ```
   */
  removeStop(index: number): this {
    if (index >= 0 && index < this.stops.length) {
      this.stops.splice(index, 1)
    }
    return this
  }

  /**
   * 创建 Canvas 渐变对象
   *
   * 根据渐变参数和给定的绘制区域尺寸，创建对应的 CanvasGradient 实例。
   * 由子类实现具体的渐变几何逻辑。
   *
   * @param ctx - Canvas 2D 渲染上下文
   * @param width - 绘制区域宽度（像素）
   * @param height - 绘制区域高度（像素）
   * @returns Canvas 原生渐变对象
   *
   * @example
   * ```ts
   * const canvasGradient = gradient.createCanvasGradient(ctx, 200, 100)
   * ctx.fillStyle = canvasGradient
   * ```
   */
  abstract createCanvasGradient(ctx: IDrawingContext, width: number, height: number): IGradient

  /**
   * 序列化为 JSON
   *
   * 将渐变实例转换为可序列化的 JSON 对象，包含类型、色标和几何参数。
   * 由子类实现具体的序列化逻辑。
   *
   * @returns 可序列化的 JSON 对象
   *
   * @example
   * ```ts
   * const json = gradient.toJSON()
   * // { type: 'linearGradient', stops: [...], x0: 0, y0: 0, x1: 100, y1: 0 }
   * ```
   */
  abstract toJSON(): any

  /**
   * 复制渐变实例
   *
   * 创建当前渐变的深拷贝副本，包含相同的几何参数和色标。
   * 由子类实现具体的复制逻辑。
   *
   * @returns 新的渐变实例副本
   *
   * @example
   * ```ts
   * const copied = gradient.copy()
   * copied.addStop(Color.GREEN, 0.5) // 不影响原实例
   * ```
   */
  abstract copy(): Gradient

  /**
   * 比较渐变是否相等
   *
   * 判断当前渐变与另一个渐变是否在类型、几何参数和色标上完全一致。
   * 由子类实现具体的比较逻辑。
   *
   * @param other - 要比较的另一个渐变实例
   * @returns 两个渐变是否相等
   *
   * @example
   * ```ts
   * if (gradient1.equals(gradient2)) {
   *   console.log('两个渐变完全相同')
   * }
   * ```
   */
  abstract equals(other: Gradient): boolean

  /**
   * 比较色标是否相等
   *
   * 逐一比较两个渐变的色标数组，判断颜色和位置是否完全一致。
   * 供子类在实现 equals 方法时调用。
   *
   * @param other - 要比较的另一个渐变实例
   * @returns 两个渐变的色标是否完全相同
   *
   * @example
   * ```ts
   * // 在子类 equals 方法中使用
   * equals(other: Gradient): boolean {
   *   if (!(other instanceof LinearGradient)) return false
   *   return this.x0 === other.x0 && this.stopsEqual(other)
   * }
   * ```
   */
  protected stopsEqual(other: Gradient): boolean {
    if (this.stops.length !== other.stops.length) return false
    for (let i = 0; i < this.stops.length; i++) {
      if (!this.stops[i].color.equals(other.stops[i].color) ||
          this.stops[i].position !== other.stops[i].position) {
        return false
      }
    }
    return true
  }

  /**
   * 应用色标到 Canvas 渐变
   *
   * 将当前实例的所有色标逐一添加到给定的 CanvasGradient 对象上。
   * 供子类在 createCanvasGradient 中调用。
   *
   * @param gradient - Canvas 原生渐变对象
   * @returns 无返回值
   *
   * @example
   * ```ts
   * // 在子类 createCanvasGradient 中使用
   * const gradient = ctx.createLinearGradient(x0, y0, x1, y1)
   * this.applyStops(gradient)
   * ```
   */
  protected applyStops(gradient: IGradient): void {
    this.stops.forEach(stop => {
      gradient.addColorStop(stop.position, stop.color.rgba)
    })
  }

  /**
   * 序列化色标数组
   *
   * 将色标数组转换为可 JSON 序列化的普通对象数组，
   * 供子类在 toJSON 方法中调用。
   *
   * @returns 序列化后的色标数组，每项包含 color 和 position
   *
   * @example
   * ```ts
   * // 在子类 toJSON 中使用
   * toJSON() {
   *   return { type: this.type, stops: this.serializeStops(), ... }
   * }
   * ```
   */
  protected serializeStops(): { color: any; position: number }[] {
    return this.stops.map(s => ({ color: s.color.toJSON(), position: s.position }))
  }

  /**
   * 反序列化色标数组
   *
   * 将 JSON 数据中的色标数组还原为 GradientStop 对象数组，
   * 供子类的 fromJSON 静态方法调用。
   *
   * @param data - JSON 格式的色标数组
   * @returns 还原后的 GradientStop 对象数组
   *
   * @example
   * ```ts
   * // 在子类 fromJSON 中使用
   * static fromJSON(data: any): LinearGradient {
   *   const stops = Gradient.deserializeStops(data.stops)
   *   return new LinearGradient(data.x0, data.y0, data.x1, data.y1, stops)
   * }
   * ```
   */
  static deserializeStops(data: any[]): GradientStop[] {
    return data.map(s => ({ color: Color.fromJSON(s.color), position: s.position }))
  }

}
