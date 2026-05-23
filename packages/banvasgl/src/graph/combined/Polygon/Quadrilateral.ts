import { GRAPHTYPE } from '@/foundation/constants'
import Style from '@/foundation/style/Style'
import { Point3, MathUtils } from '@/foundation/math'
import Polygon from './Polygon'
import { IQuadrilateral, ISerializable } from '@/types'
import { generateId } from '@/foundation/utils'

/**
 * Quadrilateral — 自由四边形
 * 4 个顶点无约束，可自由拖拽，不保证直角或平行。
 * setControlPoint 直接继承 Polygon 的默认实现（无约束）。
 *
 * 顶点顺序（逆时针）：
 *   0=左上，1=右上，2=右下，3=左下（初始构造时）
 *   拖拽后顺序保持不变，但不再保证任何几何约束。
 */
export default class Quadrilateral
  extends Polygon
  implements IQuadrilateral, ISerializable
{
  public type: GRAPHTYPE = GRAPHTYPE.QUADRILATERAL

  constructor(p0: Point3, p1: Point3, p2: Point3, p3: Point3, style?: Style) {
    super([p0, p1, p2, p3], style, true)
    this.id = generateId(this.type)
  }

  // ── 几何判断工具 ──────────────────────────────────────────

  /**
   * 判断是否为平行四边形（两组对边分别平行）
   */
  public isParallelogram(tolerance: number = 0.01): boolean {
    const [v0, v1, v2, v3] = this.controlPoints
    const side01 = v1.subtract(v0)
    const side32 = v2.subtract(v3)
    const side12 = v2.subtract(v1)
    const side03 = v3.subtract(v0)

    return (
      MathUtils.isParallel(side01, side32, tolerance) &&
      MathUtils.isParallel(side12, side03, tolerance)
    )
  }

  /**
   * 判断是否为菱形（平行四边形 + 四边等长）
   */
  public isRhombus(tolerance: number = 0.01): boolean {
    if (!this.isParallelogram(tolerance)) return false
    const [v0, v1, v2, v3] = this.controlPoints
    const len01 = v0.distance(v1)
    const len12 = v1.distance(v2)
    const len23 = v2.distance(v3)
    const len30 = v3.distance(v0)
    const avg = (len01 + len12 + len23 + len30) / 4
    return (
      Math.abs(len01 - avg) / avg < tolerance &&
      Math.abs(len12 - avg) / avg < tolerance &&
      Math.abs(len23 - avg) / avg < tolerance &&
      Math.abs(len30 - avg) / avg < tolerance
    )
  }

  /**
   * 判断是否为矩形（平行四边形 + 相邻边垂直）
   */
  public isRectangle(tolerance: number = 0.01): boolean {
    if (!this.isParallelogram(tolerance)) return false
    const [v0, v1, , v3] = this.controlPoints
    const side01 = v1.subtract(v0)
    const side03 = v3.subtract(v0)
    return MathUtils.isPerpendicular(side01, side03, tolerance)
  }

  /**
   * 判断是否为正方形（矩形 + 四边等长）
   */
  public isSquare(tolerance: number = 0.01): boolean {
    return this.isRectangle(tolerance) && this.isRhombus(tolerance)
  }

  /**
   * 判断是否为梯形（恰好一组对边平行，另一组不平行）
   */
  public isTrapezoid(tolerance: number = 0.01): boolean {
    const [v0, v1, v2, v3] = this.controlPoints
    const side01 = v1.subtract(v0)
    const side32 = v2.subtract(v3)
    const side12 = v2.subtract(v1)
    const side03 = v3.subtract(v0)

    const pair1Parallel = MathUtils.isParallel(side01, side32, tolerance)
    const pair2Parallel = MathUtils.isParallel(side12, side03, tolerance)

    return pair1Parallel !== pair2Parallel // 恰好一组平行
  }

  /**
   * 综合判断四边形类型
   */
  public getQuadrilateralType(): 'rectangle' | 'square' | 'rhombus' | 'parallelogram' | 'trapezoid' | 'general' {
    if (this.isSquare())       return 'square'
    if (this.isRectangle())    return 'rectangle'
    if (this.isRhombus())      return 'rhombus'
    if (this.isParallelogram()) return 'parallelogram'
    if (this.isTrapezoid())    return 'trapezoid'
    return 'general'
  }

  // ── 静态工厂 ──────────────────────────────────────────────

  /**
   * 从矩形参数创建自由四边形（初始为矩形形状）
   */
  public static fromRect(x: number, y: number, width: number, height: number, style?: Style): Quadrilateral {
    return new Quadrilateral(
      new Point3(x,         y,          0),
      new Point3(x + width, y,          0),
      new Point3(x + width, y + height, 0),
      new Point3(x,         y + height, 0),
      style
    )
  }

  // ── 序列化 ────────────────────────────────────────────────

  public toJSON(): any {
    return {
      id: this.id,
      type: this.type,
      controlPoints: this.controlPoints.map(v => v.toJSON()),
      closed: this.closed,
      style: this.style.toJSON(),
    }
  }

  public static fromJSON(data: any): Quadrilateral {
    const [p0, p1, p2, p3] = data.controlPoints.map((v: any) => Point3.fromJSON(v))
    const style = Style.fromJSON(data.style)
    const q = new Quadrilateral(p0, p1, p2, p3, style)
    q.id = data.id
    return q
  }

  public copy(): this {
    const [p0, p1, p2, p3] = this.controlPoints
    return new Quadrilateral(p0.copy(), p1.copy(), p2.copy(), p3.copy(), this.style.copy()) as this
  }
}
