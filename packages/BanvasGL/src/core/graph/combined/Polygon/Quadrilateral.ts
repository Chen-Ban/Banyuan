import { GRAPHTYPE } from '@/core/constants'
import Style from '@/core/style/Style'
import { Point3 } from '@/core/math'
import Polygon from './Polygon'
import { IQuadrilateral, ISerializable } from '@/core/interfaces'
import { generateId } from '@/core/utils'
import MathUtils from '@/core/math/MathUtils'

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
   * 计算两向量的叉积 z 分量（判断平行/垂直用）
   */
  private static cross2D(ax: number, ay: number, bx: number, by: number): number {
    return ax * by - ay * bx
  }

  /**
   * 计算两向量的点积
   */
  private static dot2D(ax: number, ay: number, bx: number, by: number): number {
    return ax * bx + ay * by
  }

  /**
   * 判断两组向量是否平行（叉积接近 0）
   */
  private static isParallel(
    ax: number, ay: number,
    bx: number, by: number,
    tolerance: number
  ): boolean {
    const lenA = Math.sqrt(ax * ax + ay * ay)
    const lenB = Math.sqrt(bx * bx + by * by)
    if (lenA < MathUtils.EPSILON || lenB < MathUtils.EPSILON) return false
    return Math.abs(Quadrilateral.cross2D(ax / lenA, ay / lenA, bx / lenB, by / lenB)) < tolerance
  }

  /**
   * 判断两组向量是否垂直（点积接近 0）
   */
  private static isPerpendicular(
    ax: number, ay: number,
    bx: number, by: number,
    tolerance: number
  ): boolean {
    const lenA = Math.sqrt(ax * ax + ay * ay)
    const lenB = Math.sqrt(bx * bx + by * by)
    if (lenA < MathUtils.EPSILON || lenB < MathUtils.EPSILON) return false
    return Math.abs(Quadrilateral.dot2D(ax / lenA, ay / lenA, bx / lenB, by / lenB)) < tolerance
  }

  /**
   * 判断是否为平行四边形（两组对边分别平行）
   */
  public isParallelogram(tolerance: number = 0.01): boolean {
    const [v0, v1, v2, v3] = this.vertices
    // 边 01 与 边 32（方向相同）
    const side01x = v1.x - v0.x, side01y = v1.y - v0.y
    const side32x = v2.x - v3.x, side32y = v2.y - v3.y
    // 边 12 与 边 03
    const side12x = v2.x - v1.x, side12y = v2.y - v1.y
    const side03x = v3.x - v0.x, side03y = v3.y - v0.y

    return (
      Quadrilateral.isParallel(side01x, side01y, side32x, side32y, tolerance) &&
      Quadrilateral.isParallel(side12x, side12y, side03x, side03y, tolerance)
    )
  }

  /**
   * 判断是否为菱形（平行四边形 + 四边等长）
   */
  public isRhombus(tolerance: number = 0.01): boolean {
    if (!this.isParallelogram(tolerance)) return false
    const [v0, v1, v2, v3] = this.vertices
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
    const [v0, v1, , v3] = this.vertices
    const side01x = v1.x - v0.x, side01y = v1.y - v0.y
    const side03x = v3.x - v0.x, side03y = v3.y - v0.y
    return Quadrilateral.isPerpendicular(side01x, side01y, side03x, side03y, tolerance)
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
    const [v0, v1, v2, v3] = this.vertices
    const side01x = v1.x - v0.x, side01y = v1.y - v0.y
    const side32x = v2.x - v3.x, side32y = v2.y - v3.y
    const side12x = v2.x - v1.x, side12y = v2.y - v1.y
    const side03x = v3.x - v0.x, side03y = v3.y - v0.y

    const pair1Parallel = Quadrilateral.isParallel(side01x, side01y, side32x, side32y, tolerance)
    const pair2Parallel = Quadrilateral.isParallel(side12x, side12y, side03x, side03y, tolerance)

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
      vertices: this.vertices.map(v => v.toJSON()),
      isClosed: this.isClosed,
      fillMode: this.fillMode,
      style: this.style.toJSON(),
    }
  }

  public static fromJSON(data: any): Quadrilateral {
    const [p0, p1, p2, p3] = data.vertices.map((v: any) => Point3.fromJSON(v))
    const style = Style.fromJSON(data.style)
    const q = new Quadrilateral(p0, p1, p2, p3, style)
    q.id = data.id
    q.fillMode = data.fillMode
    return q
  }

  public copy(): this {
    const [p0, p1, p2, p3] = this.vertices
    return new Quadrilateral(p0.copy(), p1.copy(), p2.copy(), p3.copy(), this.style.copy()) as this
  }
}
