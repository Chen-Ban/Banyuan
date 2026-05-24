import { GraphType } from '@/foundation/constants'
import Style from '@/foundation/style/Style'
import { Point3, MathUtils } from '@/foundation/math'
import Polygon from './Polygon'
import { IQuadrilateral, ISerializable } from '@/types'
import { generateId } from '@/foundation/utils'

/**
 * 自由四边形 —— 4 个顶点无约束，可自由拖拽。
 *
 * Quadrilateral 继承自 {@link Polygon}，实现了 {@link IQuadrilateral} 和 {@link ISerializable} 接口，
 * 是 BanvasGL 中自由四边形的实现。
 *
 * **架构位置**：位于 `graph/combined/Polygon` 层，与 Rectangle（轴对齐矩形）同为四边形的两种实现。
 * Rectangle 有严格的宽高约束，而 Quadrilateral 的 4 个顶点可自由移动，不保证直角或平行。
 *
 * **核心特性**：
 * - 顶点自由拖拽：直接继承 Polygon 的 `setControlPoint`（无约束）
 * - 丰富的几何判断方法：平行四边形、菱形、矩形、正方形、梯形
 * - 综合类型判断：`getQuadrilateralType` 返回最具体的四边形分类
 *
 * **顶点顺序**（逆时针）：
 *   0=左上，1=右上，2=右下，3=左下（初始构造时）。
 *   拖拽后顺序保持不变，但不再保证任何几何约束。
 *
 * **几何判断原理**：
 * - `isParallelogram`：两组对边分别平行（向量方向相同或相反）
 * - `isRhombus`：平行四边形 + 四边等长
 * - `isRectangle`：平行四边形 + 相邻边垂直
 * - `isSquare`：矩形 + 菱形（即四边等长 + 四角直角）
 * - `isTrapezoid`：恰好一组对边平行，另一组不平行
 *
 * @example
 * ```ts
 * const q = new Quadrilateral(
 *   new Point3(0, 0, 0),
 *   new Point3(100, 0, 0),
 *   new Point3(80, 60, 0),
 *   new Point3(20, 60, 0),
 *   style
 * );
 * q.isParallelogram(); // false
 * q.isTrapezoid();     // true
 * ```
 */
export default class Quadrilateral
  extends Polygon
  implements IQuadrilateral, ISerializable
{
  /** 图形类型标识 */
  public type: GraphType = GraphType.QUADRILATERAL

  /**
   * 创建一个自由四边形实例。
   *
   * @param {Point3} p0 - 第 1 个顶点（初始左上）
   * @param {Point3} p1 - 第 2 个顶点（初始右上）
   * @param {Point3} p2 - 第 3 个顶点（初始右下）
   * @param {Point3} p3 - 第 4 个顶点（初始左下）
   * @param {Style} [style] - 图形样式
   *
   * @example
   * ```ts
   * const q = new Quadrilateral(
   *   new Point3(0, 0, 0),
   *   new Point3(100, 0, 0),
   *   new Point3(100, 60, 0),
   *   new Point3(0, 60, 0),
   *   style
   * );
   * ```
   */
  constructor(p0: Point3, p1: Point3, p2: Point3, p3: Point3, _style?: Style) {
    super([p0, p1, p2, p3], undefined, true)
    this.id = generateId(this.type)
  }

  // ── 几何判断工具 ──────────────────────────────────────────

  /**
   * 判断是否为平行四边形（两组对边分别平行）。
   *
   * 通过检查对边向量的方向是否平行来判断：
   * 边 0→1 与边 3→2 是否平行，边 1→2 与边 0→3 是否平行。
   *
   * @param {number} [tolerance=0.01] - 平行判断的容差，值越小要求越严格
   * @returns {boolean} 是否为平行四边形
   *
   * @example
   * ```ts
   * const q = new Quadrilateral(p0, p1, p2, p3, style);
   * q.isParallelogram();     // true 或 false
   * q.isParallelogram(0.001); // 更严格的判断
   * ```
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
   * 判断是否为菱形（平行四边形 + 四边等长）。
   *
   * 先判断是否为平行四边形，再检查四条边的长度是否相等。
   * 等长判断使用相对误差：`|边长 - 平均值| / 平均值 < tolerance`。
   *
   * @param {number} [tolerance=0.01] - 等长和平行判断的容差
   * @returns {boolean} 是否为菱形
   *
   * @example
   * ```ts
   * const q = new Quadrilateral(p0, p1, p2, p3, style);
   * q.isRhombus(); // true 或 false
   * ```
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
   * 判断是否为矩形（平行四边形 + 相邻边垂直）。
   *
   * 先判断是否为平行四边形，再检查从同一顶点出发的两条相邻边是否垂直。
   * 垂直判断使用 `MathUtils.isPerpendicular`。
   *
   * @param {number} [tolerance=0.01] - 垂直和平行判断的容差
   * @returns {boolean} 是否为矩形
   *
   * @example
   * ```ts
   * const q = new Quadrilateral(p0, p1, p2, p3, style);
   * q.isRectangle(); // true 或 false
   * ```
   */
  public isRectangle(tolerance: number = 0.01): boolean {
    if (!this.isParallelogram(tolerance)) return false
    const [v0, v1, , v3] = this.controlPoints
    const side01 = v1.subtract(v0)
    const side03 = v3.subtract(v0)
    return MathUtils.isPerpendicular(side01, side03, tolerance)
  }

  /**
   * 判断是否为正方形（矩形 + 菱形，即四边等长 + 四角直角）。
   *
   * @param {number} [tolerance=0.01] - 判断容差
   * @returns {boolean} 是否为正方形
   *
   * @example
   * ```ts
   * const q = new Quadrilateral(p0, p1, p2, p3, style);
   * q.isSquare(); // true 或 false
   * ```
   */
  public isSquare(tolerance: number = 0.01): boolean {
    return this.isRectangle(tolerance) && this.isRhombus(tolerance)
  }

  /**
   * 判断是否为梯形（恰好一组对边平行，另一组不平行）。
   *
   * 检查两组对边的平行情况，当恰好一组平行时为梯形。
   * 若两组都平行则为平行四边形，若都不平行则为一般四边形。
   *
   * @param {number} [tolerance=0.01] - 平行判断的容差
   * @returns {boolean} 是否为梯形
   *
   * @example
   * ```ts
   * const q = new Quadrilateral(p0, p1, p2, p3, style);
   * q.isTrapezoid(); // true 或 false
   * ```
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
   * 综合判断四边形类型，返回最具体的分类。
   *
   * 判断优先级（从最具体到最一般）：
   * 正方形 > 矩形 > 菱形 > 平行四边形 > 梯形 > 一般四边形
   *
   * @returns {'rectangle' | 'square' | 'rhombus' | 'parallelogram' | 'trapezoid' | 'general'} 四边形类型
   *
   * @example
   * ```ts
   * const q = new Quadrilateral(p0, p1, p2, p3, style);
   * const type = q.getQuadrilateralType();
   * console.log(type); // 'square' | 'rectangle' | 'rhombus' | 'parallelogram' | 'trapezoid' | 'general'
   * ```
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
   * 从矩形参数创建自由四边形（静态工厂方法）。
   *
   * 初始形状为轴对齐矩形，之后可自由拖拽顶点。
   *
   * @param {number} x - 左上角 x 坐标
   * @param {number} y - 左上角 y 坐标
   * @param {number} width - 宽度
   * @param {number} height - 高度
   * @param {Style} [style] - 图形样式
   * @returns {Quadrilateral} 自由四边形实例（初始为矩形形状）
   *
   * @example
   * ```ts
   * const q = Quadrilateral.fromRect(0, 0, 200, 100, style);
   * ```
   */
  public static fromRect(x: number, y: number, width: number, height: number, _style?: Style): Quadrilateral {
    return new Quadrilateral(
      new Point3(x,         y,          0),
      new Point3(x + width, y,          0),
      new Point3(x + width, y + height, 0),
      new Point3(x,         y + height, 0),
      undefined
    )
  }

  // ── 序列化 ────────────────────────────────────────────────

  /**
   * 将自由四边形序列化为 JSON 对象。
   *
   * @returns {any} 包含 id、type、controlPoints、closed、style 的 JSON 对象
   *
   * @example
   * ```ts
   * const json = q.toJSON();
   * // json = { id: '...', type: GraphType.QUADRILATERAL, controlPoints: [...], closed: true, style: {...} }
   * ```
   */
  public toJSON(): any {
    return {
      id: this.id,
      type: this.type,
      controlPoints: this.controlPoints.map(v => v.toJSON()),
      closed: this.closed,
    }
  }

  /**
   * 从 JSON 数据重建 Quadrilateral 实例。
   *
   * @param {any} data - 序列化数据，需包含 controlPoints（4 个点）、style
   * @returns {Quadrilateral} 重建的自由四边形实例
   *
   * @example
   * ```ts
   * const q = Quadrilateral.fromJSON({
   *   id: '...',
   *   type: GraphType.QUADRILATERAL,
   *   controlPoints: [{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }, { x: 80, y: 60, z: 0 }, { x: 20, y: 60, z: 0 }],
   *   closed: true,
   *   style: {...}
   * });
   * ```
   */
  public static fromJSON(data: any): Quadrilateral {
    const [p0, p1, p2, p3] = data.controlPoints.map((v: any) => Point3.fromJSON(v))
    const q = new Quadrilateral(p0, p1, p2, p3, undefined)
    q.id = data.id
    return q
  }

  /**
   * 复制自由四边形，返回一个深拷贝的新实例。
   *
   * @returns {this} 复制后的自由四边形实例
   *
   * @example
   * ```ts
   * const copy = q.copy();
   * ```
   */
  public copy(): this {
    const [p0, p1, p2, p3] = this.controlPoints
    return new Quadrilateral(p0.copy(), p1.copy(), p2.copy(), p3.copy(), undefined) as this
  }
}
