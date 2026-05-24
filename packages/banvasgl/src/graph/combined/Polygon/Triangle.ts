import { GraphType } from "@/foundation/constants";
import Style from "@/foundation/style/Style";
import { MathUtils, Point3, GeometryUtils } from "@/foundation/math";
import Polygon from "./Polygon";
import { ITriangle, ISerializable } from '@/types';

/**
 * 三角形 —— 由三个顶点构成的最简多边形。
 *
 * Triangle 继承自 {@link Polygon}，实现了 {@link ITriangle} 和 {@link ISerializable} 接口，
 * 是 BanvasGL 中三角形的实现。
 *
 * **架构位置**：位于 `graph/combined/Polygon` 层，继承自 Polygon，
 * 与 Rectangle、Quadrilateral、RegularPolygon 同属多边形家族。
 *
 * **核心特性**：
 * - 三个顶点自由拖拽（继承 Polygon 的 `setControlPoint`）
 * - 丰富的几何计算：重心、外心、高、三角形类型判断
 * - 多种静态工厂方法：等边三角形、等腰三角形、直角三角形
 *
 * **数学原理**：
 * - **重心（Centroid）**：三条中线的交点，坐标为三个顶点坐标的算术平均值。
 *   公式：\( G = \left(\frac{x_1 + x_2 + x_3}{3}, \frac{y_1 + y_2 + y_3}{3}\right) \)
 *
 * - **外心（Circumcenter）**：三条垂直平分线的交点，即外接圆的圆心。
 *   通过行列式公式计算，当三点共线时退化为重心。
 *
 * - **高（Height）**：从指定顶点到对边的垂直距离，使用 `GeometryUtils.perpendicularDistance` 计算。
 *
 * - **三角形类型判断**：基于三边长度关系和勾股定理判断等边、等腰、直角、直角等腰、一般三角形。
 *
 * @example
 * ```ts
 * const tri = new Triangle(
 *   new Point3(0, 0, 0),
 *   new Point3(100, 0, 0),
 *   new Point3(50, 86, 0),
 *   style
 * );
 * console.log(tri.getTriangleType()); // 'isosceles' | 'equilateral' | 'scalene' | 'right' | 'right-isosceles'
 * console.log(tri.getCentroid());     // 重心
 * console.log(tri.getCircumcenter()); // 外心
 * ```
 */
export default class Triangle extends Polygon implements ITriangle, ISerializable {
  /** 图形类型标识 */
  public type: GraphType = GraphType.TRIANGLE;

  /**
   * 创建一个三角形实例。
   *
   * @param {Point3} p1 - 第 1 个顶点
   * @param {Point3} p2 - 第 2 个顶点
   * @param {Point3} p3 - 第 3 个顶点
   * @param {Style} [style] - 图形样式
   *
   * @example
   * ```ts
   * const tri = new Triangle(
   *   new Point3(0, 0, 0),
   *   new Point3(100, 0, 0),
   *   new Point3(50, 86, 0),
   *   style
   * );
   * ```
   */
  constructor(p1: Point3, p2: Point3, p3: Point3, _style?: Style) {
    super([p1, p2, p3], undefined, true);
  }

  /**
   * 获取三角形的三个顶点（拷贝，外部修改不影响内部状态）。
   *
   * @returns {{ p1: Point3; p2: Point3; p3: Point3 }} 三个顶点的拷贝
   *
   * @example
   * ```ts
   * const { p1, p2, p3 } = tri.getVertices();
   * console.log(p1.x, p1.y);
   * ```
   */
  public getVertices(): { p1: Point3; p2: Point3; p3: Point3 } {
    return {
      p1: this.controlPoints[0].copy(),
      p2: this.controlPoints[1].copy(),
      p3: this.controlPoints[2].copy(),
    };
  }

  /**
   * 设置三角形的三个顶点。
   *
   * @param {Point3} p1 - 新的第 1 个顶点
   * @param {Point3} p2 - 新的第 2 个顶点
   * @param {Point3} p3 - 新的第 3 个顶点
   * @returns {Triangle} 当前实例（支持链式调用）
   *
   * @example
   * ```ts
   * tri.setVertices(
   *   new Point3(0, 0, 0),
   *   new Point3(200, 0, 0),
   *   new Point3(100, 150, 0)
   * );
   * ```
   */
  public setVertices(p1: Point3, p2: Point3, p3: Point3): Triangle {
    this.controlPoints = [p1.copy(), p2.copy(), p3.copy()];
    this.rebuildEdges();
    return this;
  }

  /**
   * 计算从指定顶点到对边的高（垂线长度）。
   *
   * 首先判断传入的顶点是三角形的哪个顶点，然后计算该顶点到对边（另外两个顶点确定的线段）
   * 的垂直距离。
   *
   * @param {Point3} vertex - 必须是三角形的某个顶点
   * @returns {number} 从 vertex 到对边的垂直距离
   * @throws {Error} 传入的 vertex 不是三角形顶点时抛出错误
   *
   * @example
   * ```ts
   * const { p1 } = tri.getVertices();
   * const h = tri.getHeight(p1); // 从 p1 到对边 p2p3 的高
   * ```
   */
  public getHeight(vertex: Point3): number {
    const [p0, p1, p2] = this.controlPoints
    let base0: Point3, base1: Point3
    if (vertex.isSame(p0)) {
      base0 = p1; base1 = p2
    } else if (vertex.isSame(p1)) {
      base0 = p0; base1 = p2
    } else if (vertex.isSame(p2)) {
      base0 = p0; base1 = p1
    } else {
      throw new Error('传入的 vertex 不是三角形的顶点')
    }
    return GeometryUtils.perpendicularDistance(vertex, base0, base1)
  }

  /**
   * 判断三角形的类型。
   *
   * 根据三边长度关系和勾股定理判断：
   * - `equilateral`（等边三角形）：三边等长
   * - `right-isosceles`（等腰直角三角形）：满足勾股定理 + 两边等长
   * - `right`（直角三角形）：满足勾股定理 \( a^2 + b^2 = c^2 \)（c 为最长边）
   * - `isosceles`（等腰三角形）：至少两边等长
   * - `scalene`（一般三角形）：三边各不相等
   *
   * @returns {'equilateral' | 'isosceles' | 'scalene' | 'right' | 'right-isosceles'} 三角形类型
   *
   * @example
   * ```ts
   * const type = tri.getTriangleType();
   * console.log(type); // 'equilateral' | 'isosceles' | 'scalene' | 'right' | 'right-isosceles'
   * ```
   */
  public getTriangleType(): 'equilateral' | 'isosceles' | 'scalene' | 'right' | 'right-isosceles' {
    const [p0, p1, p2] = this.controlPoints

    const side1 = p0.distance(p1)
    const side2 = p1.distance(p2)
    const side3 = p2.distance(p0)

    const sides = [side1, side2, side3].sort((a, b) => a - b)
    const [a, b, c] = sides

    const isRight = Math.abs(a * a + b * b - c * c) < MathUtils.EPSILON
    const isEquilateral =
      Math.abs(side1 - side2) < MathUtils.EPSILON &&
      Math.abs(side2 - side3) < MathUtils.EPSILON
    const isIsosceles =
      Math.abs(side1 - side2) < MathUtils.EPSILON ||
      Math.abs(side2 - side3) < MathUtils.EPSILON ||
      Math.abs(side1 - side3) < MathUtils.EPSILON

    if (isEquilateral) return 'equilateral'
    if (isRight && isIsosceles) return 'right-isosceles'
    if (isRight) return 'right'
    if (isIsosceles) return 'isosceles'
    return 'scalene'
  }

  /**
   * 计算三角形的重心（三条中线的交点）。
   *
   * 重心坐标为三个顶点坐标的算术平均值：
   * \( G = \left(\frac{x_1 + x_2 + x_3}{3}, \frac{y_1 + y_2 + y_3}{3}, \frac{z_1 + z_2 + z_3}{3}\right) \)
   *
   * 包含防御性检查：构造期 `super()` 链中 `controlPoints` 尚未赋值时，
   * fallback 到父类 `CombinedGraph.getCentroid()` 的实现。
   *
   * @returns {Point3} 重心坐标
   *
   * @example
   * ```ts
   * const centroid = tri.getCentroid();
   * ```
   */
  public getCentroid(): Point3 {
    // 防御性检查：构造期 super() 链中 controlPoints 尚未赋值时，fallback 到父类实现
    if (!this.controlPoints || this.controlPoints.length < 3) {
      return super.getCentroid();
    }
    const [p0, p1, p2] = this.controlPoints
    return new Point3((p0.x + p1.x + p2.x) / 3, (p0.y + p1.y + p2.y) / 3, (p0.z + p1.z + p2.z) / 3);
  }

  /**
   * 计算三角形的外心（外接圆的圆心）。
   *
   * 外心是三条垂直平分线的交点，通过行列式公式计算：
   * \[
   *   d = 2 \cdot (ax(by - cy) + bx(cy - ay) + cx(ay - by))
   * \]
   * \[
   *   u_x = \frac{(ax^2 + ay^2)(by - cy) + (bx^2 + by^2)(cy - ay) + (cx^2 + cy^2)(ay - by)}{d}
   * \]
   * \[
   *   u_y = \frac{(ax^2 + ay^2)(cx - bx) + (bx^2 + by^2)(ax - cx) + (cx^2 + cy^2)(bx - ax)}{d}
   * \]
   *
   * 当三点共线（`|d| < EPSILON`）时，外心退化为重心。
   *
   * @returns {Point3} 外心坐标
   *
   * @example
   * ```ts
   * const circumcenter = tri.getCircumcenter();
   * ```
   */
  public getCircumcenter(): Point3 {
    const [p0, p1, p2] = this.controlPoints

    const ax = p0.x, ay = p0.y
    const bx = p1.x, by = p1.y
    const cx = p2.x, cy = p2.y

    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));

    if (Math.abs(d) < MathUtils.EPSILON) {
      // 三点共线，返回重心
      return this.getCentroid();
    }

    const ux =
      ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
    const uy =
      ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;

    return new Point3(ux, uy, (p0.z + p1.z + p2.z) / 3);
  }

  // ── 序列化 ──

  /**
   * 将三角形序列化为 JSON 对象。
   *
   * @returns {any} 包含 id、type、controlPoints、style 的 JSON 对象
   *
   * @example
   * ```ts
   * const json = tri.toJSON();
   * // json = { id: '...', type: GraphType.TRIANGLE, controlPoints: [...], style: {...} }
   * ```
   */
  public toJSON(): any {
    return {
      id: this.id,
      type: this.type,
      controlPoints: this.controlPoints.map(v => v.toJSON()),
    }
  }

  /**
   * 从 JSON 数据重建 Triangle 实例。
   *
   * @param {any} data - 序列化数据，需包含 controlPoints（3 个点）、style
   * @returns {Triangle} 重建的三角形实例
   *
   * @example
   * ```ts
   * const tri = Triangle.fromJSON({
   *   id: '...',
   *   type: GraphType.TRIANGLE,
   *   controlPoints: [{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }, { x: 50, y: 86, z: 0 }],
   *   style: {...}
   * });
   * ```
   */
  public static fromJSON(data: any): Triangle {
    const points = data.controlPoints.map((v: any) => Point3.fromJSON(v))
    const triangle = new Triangle(points[0], points[1], points[2], undefined)
    triangle.id = data.id
    return triangle
  }

  /**
   * 复制三角形，返回一个深拷贝的新实例。
   *
   * @returns {this} 复制后的三角形实例
   *
   * @example
   * ```ts
   * const copy = tri.copy();
   * ```
   */
  public copy(): this {
    const [p0, p1, p2] = this.controlPoints
    return new Triangle(p0.copy(), p1.copy(), p2.copy(), undefined) as this;
  }

  /**
   * 创建等边三角形（静态工厂方法）。
   *
   * 等边三角形的高为 \( h = \frac{s\sqrt{3}}{2} \)，
   * 重心位于高的 2/3 处，因此顶点在重心上方 \( \frac{2h}{3} \)，底边在重心下方 \( \frac{h}{3} \)。
   *
   * @param {Point3} center - 重心位置
   * @param {number} sideLength - 边长
   * @param {Style} [style] - 图形样式
   * @returns {Triangle} 等边三角形实例
   *
   * @example
   * ```ts
   * const equilateral = Triangle.createEquilateral(new Point3(100, 100, 0), 80, style);
   * ```
   */
  public static createEquilateral(center: Point3, sideLength: number, _style?: Style): Triangle {
    const height = (sideLength * Math.sqrt(3)) / 2;
    const p1 = new Point3(center.x, center.y - (height * 2) / 3, center.z);
    const p2 = new Point3(center.x - sideLength / 2, center.y + (height * 1) / 3, center.z);
    const p3 = new Point3(center.x + sideLength / 2, center.y + (height * 1) / 3, center.z);
    return new Triangle(p1, p2, p3, undefined);
  }

  /**
   * 创建等腰三角形（静态工厂方法）。
   *
   * 等腰三角形以 center 为重心，底边长为 base，高为 height。
   * 顶点在上方，底边两个端点在下方。
   *
   * @param {Point3} center - 重心位置
   * @param {number} base - 底边长度
   * @param {number} height - 高（从底边到顶点的距离）
   * @param {Style} [style] - 图形样式
   * @returns {Triangle} 等腰三角形实例
   *
   * @example
   * ```ts
   * const iso = Triangle.createIsosceles(new Point3(100, 100, 0), 80, 120, style);
   * ```
   */
  public static createIsosceles(center: Point3, base: number, height: number, _style?: Style): Triangle {
    const p1 = new Point3(center.x, center.y - height / 2, center.z);
    const p2 = new Point3(center.x - base / 2, center.y + height / 2, center.z);
    const p3 = new Point3(center.x + base / 2, center.y + height / 2, center.z);
    return new Triangle(p1, p2, p3, undefined);
  }

  /**
   * 创建直角三角形（静态工厂方法）。
   *
   * 直角位于左下角（p1），两条直角边分别沿水平和垂直方向。
   * center 为三角形的外接矩形中心（非重心）。
   *
   * @param {Point3} center - 外接矩形中心
   * @param {number} width - 水平直角边长度
   * @param {number} height - 垂直直角边长度
   * @param {Style} [style] - 图形样式
   * @returns {Triangle} 直角三角形实例
   *
   * @example
   * ```ts
   * const right = Triangle.createRight(new Point3(100, 100, 0), 120, 80, style);
   * ```
   */
  public static createRight(center: Point3, width: number, height: number, _style?: Style): Triangle {
    const p1 = new Point3(center.x - width / 2, center.y - height / 2, center.z);
    const p2 = new Point3(center.x + width / 2, center.y - height / 2, center.z);
    const p3 = new Point3(center.x - width / 2, center.y + height / 2, center.z);
    return new Triangle(p1, p2, p3, undefined);
  }
}
