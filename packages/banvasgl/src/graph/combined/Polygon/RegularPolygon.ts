import { GraphType } from "@/foundation/constants";
import Style from "@/foundation/style/Style";
import { Point3 } from "@/foundation/math";
import Polygon from "./Polygon";
import type { IRegularPolygon } from '@/types/graph/graph'
import type { ISerializable } from '@/types/foundation/serializable'

/**
 * 正多边形 —— 所有顶点等距于中心点的多边形。
 *
 * RegularPolygon 继承自 {@link Polygon}，实现了 {@link IRegularPolygon} 和 {@link ISerializable} 接口，
 * 是 BanvasGL 中正多边形的实现。
 *
 * **架构位置**：位于 `graph/combined/Polygon` 层，继承自 Polygon，
 * 与 Rectangle、Quadrilateral、Triangle 同属多边形家族。
 *
 * **核心特性**：
 * - 维护 `center`（中心点）、`radius`（外接圆半径）、`sides`（边数）、`rotation`（旋转角）四个属性
 * - 顶点由 `generatePoints` 算法自动生成，保证所有顶点等距于中心
 * - `setControlPoint` 拖拽任意顶点时，以该顶点到中心的距离更新 `radius`，保持正多边形约束
 * - 提供丰富的几何计算：内角、外角、边长、内切圆半径、面积、周长
 * - 提供多种静态工厂方法：正三角形、正方形、正五边形、正六边形等
 *
 * **顶点生成算法**：
 * \[
 *   x_i = center_x + radius \cdot \cos\left(\frac{2\pi i}{n} + rotation\right)
 * \]
 * \[
 *   y_i = center_y + radius \cdot \sin\left(\frac{2\pi i}{n} + rotation\right)
 * \]
 * 其中 `i` 从 0 到 `sides - 1`，`n` 为边数。
 *
 * **setControlPoint 半径更新逻辑**：
 * 拖拽任意顶点时，计算该顶点到中心的新距离作为 `radius`，
 * 然后重新生成所有顶点，保持正多边形的约束（所有顶点等距中心）。
 * 当新半径 < 1 时拒绝更新以防止图形退化。
 *
 * @example
 * ```ts
 * // 创建正六边形
 * const hexagon = new RegularPolygon(new Point3(100, 100, 0), 50, 6, 0, style);
 * console.log(hexagon.getSideLength()); // 边长
 * console.log(hexagon.getArea());       // 面积
 * ```
 */
export default class RegularPolygon extends Polygon implements IRegularPolygon, ISerializable {
  /** 图形类型标识 */
  public type: GraphType = GraphType.REGULAR_POLYGON;

  /** 正多边形的中心点 */
  public center: Point3;

  /** 外接圆半径（中心点到顶点的距离） */
  public radius: number;

  /** 边数（≥ 3） */
  public sides: number;

  /** 旋转角度（弧度），0 表示第一个顶点在右侧水平方向 */
  public rotation: number;

  /**
   * 创建一个正多边形实例。
   *
   * @param {Point3} center - 中心点
   * @param {number} radius - 外接圆半径
   * @param {number} sides - 边数（≥ 3）
   * @param {number} [rotation=0] - 旋转角度（弧度）
   * @param {Style} [style] - 图形样式
   *
   * @example
   * ```ts
   * const hex = new RegularPolygon(new Point3(100, 100, 0), 50, 6, 0, style);
   * const triangle = new RegularPolygon(new Point3(200, 200, 0), 40, 3, Math.PI / 6, style);
   * ```
   */
  constructor(center: Point3, radius: number, sides: number, rotation: number = 0, _style?: Style) {
    const points = RegularPolygon.generatePoints(center, radius, sides, rotation);
    super(points, undefined, true);
    this.center = center.copy();
    this.radius = radius;
    this.sides = sides;
    this.rotation = rotation;
  }

  /**
   * 根据中心点、半径、边数和旋转角生成正多边形的顶点。
   *
   * 算法：将圆周等分为 `sides` 份，每个顶点的角度为 `i × (2π/n) + rotation`，
   * 坐标为 `(center.x + radius × cos(angle), center.y + radius × sin(angle))`。
   *
   * @param {Point3} center - 中心点
   * @param {number} radius - 外接圆半径
   * @param {number} sides - 边数
   * @param {number} rotation - 旋转角度（弧度）
   * @returns {Point3[]} 顶点坐标数组
   *
   * @example
   * ```ts
   * // 内部调用
   * const points = RegularPolygon.generatePoints(center, 50, 6, 0);
   * ```
   */
  private static generatePoints(center: Point3, radius: number, sides: number, rotation: number): Point3[] {
    const points: Point3[] = [];
    const angleStep = (2 * Math.PI) / sides;

    for (let i = 0; i < sides; i++) {
      const angle = i * angleStep + rotation;
      const x = center.x + radius * Math.cos(angle);
      const y = center.y + radius * Math.sin(angle);
      points.push(new Point3(x, y, center.z));
    }

    return points;
  }

  /**
   * 设置正多边形的中心点。
   *
   * 移动中心点后，所有顶点会重新生成以保持正多边形约束。
   *
   * @param {Point3} center - 新的中心点
   * @returns {RegularPolygon} 当前实例（支持链式调用）
   *
   * @example
   * ```ts
   * hex.setCenter(new Point3(150, 150, 0));
   * ```
   */
  public setCenter(center: Point3): RegularPolygon {
    this.center = center.copy();
    this.controlPoints = RegularPolygon.generatePoints(this.center, this.radius, this.sides, this.rotation);
    this.rebuildEdges();
    return this;
  }

  /**
   * 设置正多边形的外接圆半径。
   *
   * 更新半径后，所有顶点会重新生成以保持正多边形约束。
   *
   * @param {number} radius - 新的外接圆半径
   * @returns {RegularPolygon} 当前实例（支持链式调用）
   *
   * @example
   * ```ts
   * hex.setRadius(80);
   * ```
   */
  public setRadius(radius: number): RegularPolygon {
    this.radius = radius;
    this.controlPoints = RegularPolygon.generatePoints(this.center, this.radius, this.sides, this.rotation);
    this.rebuildEdges();
    return this;
  }

  /**
   * 设置正多边形的边数。
   *
   * 更新边数后，所有顶点会重新生成。边数必须 ≥ 3。
   *
   * @param {number} sides - 新的边数（≥ 3）
   * @returns {RegularPolygon} 当前实例（支持链式调用）
   * @throws {Error} 边数 < 3 时抛出错误
   *
   * @example
   * ```ts
   * hex.setSides(8); // 变为正八边形
   * ```
   */
  public setSides(sides: number): RegularPolygon {
    if (sides < 3) {
      throw new Error("Regular polygon must have at least 3 sides");
    }
    this.sides = sides;
    this.controlPoints = RegularPolygon.generatePoints(this.center, this.radius, this.sides, this.rotation);
    this.rebuildEdges();
    return this;
  }

  /**
   * 计算正多边形的内角。
   *
   * 公式：\( \alpha = \frac{(n - 2) \cdot \pi}{n} \)
   *
   * @returns {number} 内角（弧度）
   *
   * @example
   * ```ts
   * const angle = hex.getInteriorAngle(); // 正六边形内角 = 2π/3 ≈ 2.094 弧度
   * ```
   */
  public getInteriorAngle(): number {
    return ((this.sides - 2) * Math.PI) / this.sides;
  }

  /**
   * 计算正多边形的外角。
   *
   * 公式：\( \beta = \frac{2\pi}{n} \)
   *
   * @returns {number} 外角（弧度）
   *
   * @example
   * ```ts
   * const angle = hex.getExteriorAngle(); // 正六边形外角 = π/3 ≈ 1.047 弧度
   * ```
   */
  public getExteriorAngle(): number {
    return (2 * Math.PI) / this.sides;
  }

  /**
   * 计算正多边形的边长。
   *
   * 公式：\( s = 2r \cdot \sin\left(\frac{\pi}{n}\right) \)
   * 其中 `r` 为外接圆半径，`n` 为边数。
   *
   * @returns {number} 边长
   *
   * @example
   * ```ts
   * const sideLen = hex.getSideLength();
   * ```
   */
  public getSideLength(): number {
    return 2 * this.radius * Math.sin(Math.PI / this.sides);
  }

  /**
   * 计算正多边形的内切圆半径（中心点到边的距离）。
   *
   * 公式：\( r_{in} = r \cdot \cos\left(\frac{\pi}{n}\right) \)
   * 其中 `r` 为外接圆半径，`n` 为边数。
   *
   * @returns {number} 内切圆半径
   *
   * @example
   * ```ts
   * const inradius = hex.getInradius();
   * ```
   */
  public getInradius(): number {
    return this.radius * Math.cos(Math.PI / this.sides);
  }

  /**
   * 计算正多边形的面积。
   *
   * 公式：\( A = \frac{n \cdot r^2 \cdot \sin\left(\frac{2\pi}{n}\right)}{2} \)
   * 其中 `n` 为边数，`r` 为外接圆半径。
   *
   * @returns {number} 面积值
   *
   * @example
   * ```ts
   * const area = hex.getArea();
   * ```
   */
  public getArea(): number {
    return (this.sides * this.radius * this.radius * Math.sin((2 * Math.PI) / this.sides)) / 2;
  }

  /**
   * 计算正多边形的周长。
   *
   * 公式：\( P = n \cdot s \)，其中 `s` 为边长。
   *
   * @returns {number} 周长值
   *
   * @example
   * ```ts
   * const perimeter = hex.getPerimeter();
   * ```
   */
  public getPerimeter(): number {
    return this.sides * this.getSideLength();
  }

  /**
   * 获取指定索引的顶点坐标（带边界检查）。
   *
   * @param {number} index - 顶点索引（0 到 sides-1）
   * @returns {Point3} 顶点坐标的拷贝
   * @throws {Error} 索引越界时抛出错误
   *
   * @example
   * ```ts
   * const firstVertex = hex.getVertex(0);
   * const lastVertex = hex.getVertex(5);
   * ```
   */
  public getVertex(index: number): Point3 {
    if (index < 0 || index >= this.sides) {
      throw new Error("Vertex index out of bounds");
    }
    return this.controlPoints[index].copy();
  }

  /**
   * 设置控制点：拖拽任意顶点时，以该顶点到中心的距离更新 radius，
   * 保持正多边形约束（所有顶点等距中心）。
   *
   * 计算新半径：\( r_{new} = \sqrt{(x - center_x)^2 + (y - center_y)^2} \)
   * 当新半径 < 1 时拒绝更新以防止图形退化。
   *
   * @param {number} _index - 控制点索引（被忽略，因为所有顶点等效）
   * @param {Point3} point - 新的控制点坐标
   *
   * @example
   * ```ts
   * // 拖拽第一个顶点到新位置
   * hex.setControlPoint(0, new Point3(160, 100, 0));
   * // 半径会自动更新为新距离
   * ```
   */
  public override setControlPoint(_index: number, point: Point3): void {
    const newRadius = Math.sqrt(
      Math.pow(point.x - this.center.x, 2) +
      Math.pow(point.y - this.center.y, 2)
    )
    if (newRadius < 1) return // 防止退化
    this.setRadius(newRadius)
  }

  // ── 序列化 ──

  /**
   * 将正多边形序列化为 JSON 对象。
   *
   * @returns {any} 包含 id、type、center、radius、sides、rotation、style 的 JSON 对象
   *
   * @example
   * ```ts
   * const json = hex.toJSON();
   * // json = { id: '...', type: GraphType.REGULAR_POLYGON, center: {...}, radius: 50, sides: 6, rotation: 0, style: {...} }
   * ```
   */
  public toJSON(): any {
    return {
      id: this.id,
      type: this.type,
      center: this.center.toJSON(),
      radius: this.radius,
      sides: this.sides,
      rotation: this.rotation,
    }
  }

  /**
   * 从 JSON 数据重建 RegularPolygon 实例。
   *
   * @param {any} data - 序列化数据，需包含 center、radius、sides、rotation、style
   * @returns {RegularPolygon} 重建的正多边形实例
   *
   * @example
   * ```ts
   * const hex = RegularPolygon.fromJSON({
   *   id: '...',
   *   type: GraphType.REGULAR_POLYGON,
   *   center: { x: 100, y: 100, z: 0 },
   *   radius: 50,
   *   sides: 6,
   *   rotation: 0,
   *   style: {...}
   * });
   * ```
   */
  public static fromJSON(data: any): RegularPolygon {
    const center = Point3.fromJSON(data.center)
    const polygon = new RegularPolygon(center, data.radius, data.sides, data.rotation, undefined)
    polygon.id = data.id
    return polygon
  }

  /**
   * 复制正多边形，返回一个深拷贝的新实例。
   *
   * @returns {this} 复制后的正多边形实例
   *
   * @example
   * ```ts
   * const copy = hex.copy();
   * ```
   */
  public copy(): this {
    return new RegularPolygon(this.center, this.radius, this.sides, this.rotation, undefined) as this;
  }

  /**
   * 创建正三角形（静态工厂方法）。
   *
   * @param {Point3} center - 中心点
   * @param {number} radius - 外接圆半径
   * @param {number} [rotation=0] - 旋转角度（弧度）
   * @param {Style} [style] - 图形样式
   * @returns {RegularPolygon} 正三角形实例
   *
   * @example
   * ```ts
   * const tri = RegularPolygon.createTriangle(new Point3(100, 100, 0), 50, 0, style);
   * ```
   */
  public static createTriangle(center: Point3, radius: number, rotation: number = 0, _style?: Style): RegularPolygon {
    return new RegularPolygon(center, radius, 3, rotation, undefined);
  }

  /**
   * 创建正方形（静态工厂方法）。
   *
   * @param {Point3} center - 中心点
   * @param {number} radius - 外接圆半径（对角线的一半）
   * @param {number} [rotation=0] - 旋转角度（弧度）
   * @param {Style} [style] - 图形样式
   * @returns {RegularPolygon} 正方形实例
   *
   * @example
   * ```ts
   * const square = RegularPolygon.createSquare(new Point3(100, 100, 0), 50, Math.PI / 4, style);
   * ```
   */
  public static createSquare(center: Point3, radius: number, rotation: number = 0, _style?: Style): RegularPolygon {
    return new RegularPolygon(center, radius, 4, rotation, undefined);
  }

  /**
   * 创建正五边形（静态工厂方法）。
   *
   * @param {Point3} center - 中心点
   * @param {number} radius - 外接圆半径
   * @param {number} [rotation=0] - 旋转角度（弧度）
   * @param {Style} [style] - 图形样式
   * @returns {RegularPolygon} 正五边形实例
   *
   * @example
   * ```ts
   * const penta = RegularPolygon.createPentagon(new Point3(100, 100, 0), 50, 0, style);
   * ```
   */
  public static createPentagon(center: Point3, radius: number, rotation: number = 0, _style?: Style): RegularPolygon {
    return new RegularPolygon(center, radius, 5, rotation, undefined);
  }

  /**
   * 创建正六边形（静态工厂方法）。
   *
   * @param {Point3} center - 中心点
   * @param {number} radius - 外接圆半径
   * @param {number} [rotation=0] - 旋转角度（弧度）
   * @param {Style} [style] - 图形样式
   * @returns {RegularPolygon} 正六边形实例
   *
   * @example
   * ```ts
   * const hex = RegularPolygon.createHexagon(new Point3(100, 100, 0), 50, 0, style);
   * ```
   */
  public static createHexagon(center: Point3, radius: number, rotation: number = 0, _style?: Style): RegularPolygon {
    return new RegularPolygon(center, radius, 6, rotation, undefined);
  }

  /**
   * 创建正八边形（静态工厂方法）。
   *
   * @param {Point3} center - 中心点
   * @param {number} radius - 外接圆半径
   * @param {number} [rotation=0] - 旋转角度（弧度）
   * @param {Style} [style] - 图形样式
   * @returns {RegularPolygon} 正八边形实例
   *
   * @example
   * ```ts
   * const oct = RegularPolygon.createOctagon(new Point3(100, 100, 0), 50, 0, style);
   * ```
   */
  public static createOctagon(center: Point3, radius: number, rotation: number = 0, _style?: Style): RegularPolygon {
    return new RegularPolygon(center, radius, 8, rotation, undefined);
  }

  /**
   * 创建正十二边形（静态工厂方法）。
   *
   * @param {Point3} center - 中心点
   * @param {number} radius - 外接圆半径
   * @param {number} [rotation=0] - 旋转角度（弧度）
   * @param {Style} [style] - 图形样式
   * @returns {RegularPolygon} 正十二边形实例
   *
   * @example
   * ```ts
   * const dodec = RegularPolygon.createDodecagon(new Point3(100, 100, 0), 50, 0, style);
   * ```
   */
  public static createDodecagon(center: Point3, radius: number, rotation: number = 0, _style?: Style): RegularPolygon {
    return new RegularPolygon(center, radius, 12, rotation, undefined);
  }

  /**
   * 创建星形多边形（静态工厂方法）。
   *
   * 通过交替使用外半径和内半径生成顶点，形成星形图案。
   * 每个角由一个外半径顶点和一个内半径顶点构成，
   * 因此总顶点数为 `points × 2`。
   *
   * @param {Point3} center - 中心点
   * @param {number} outerRadius - 外半径（角尖到中心的距离）
   * @param {number} innerRadius - 内半径（凹处到中心的距离）
   * @param {number} points - 角数
   * @param {number} [rotation=0] - 旋转角度（弧度）
   * @param {Style} [style] - 图形样式
   * @returns {Polygon} 星形多边形实例（返回 Polygon 而非 RegularPolygon，因为不是正多边形）
   *
   * @example
   * ```ts
   * const star = RegularPolygon.createStar(center, 50, 25, 5, 0, style);
   * // 创建一个五角星
   * ```
   */
  public static createStar(
    center: Point3,
    outerRadius: number,
    innerRadius: number,
    points: number,
    rotation: number = 0,
    _style?: Style
  ): Polygon {
    const starPoints: Point3[] = [];
    const angleStep = Math.PI / points;

    for (let i = 0; i < points * 2; i++) {
      const angle = i * angleStep + rotation;
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const x = center.x + radius * Math.cos(angle);
      const y = center.y + radius * Math.sin(angle);
      starPoints.push(new Point3(x, y, center.z));
    }

    return new Polygon(starPoints, undefined, true);
  }
}
