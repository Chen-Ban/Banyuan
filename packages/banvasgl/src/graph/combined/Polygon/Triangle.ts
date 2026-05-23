import { GRAPHTYPE } from "@/foundation/constants";
import Style from "@/foundation/style/Style";
import { MathUtils, Point3, GeometryUtils } from "@/foundation/math";
import Polygon from "./Polygon";
import { ITriangle, ISerializable } from '@/types';

/**
 * Triangle类 - 三角形
 * 继承自Polygon，专门用于创建和管理三角形
 */
export default class Triangle extends Polygon implements ITriangle, ISerializable {
  public type: GRAPHTYPE = GRAPHTYPE.TRIANGLE;

  constructor(p1: Point3, p2: Point3, p3: Point3, style?: Style) {
    super([p1, p2, p3], style, true);
  }

  /**
   * 获取三角形的三个顶点（拷贝，外部修改不影响内部状态）
   */
  public getVertices(): { p1: Point3; p2: Point3; p3: Point3 } {
    return {
      p1: this.controlPoints[0].copy(),
      p2: this.controlPoints[1].copy(),
      p3: this.controlPoints[2].copy(),
    };
  }

  /**
   * 设置三角形的三个顶点
   */
  public setVertices(p1: Point3, p2: Point3, p3: Point3): Triangle {
    this.controlPoints = [p1.copy(), p2.copy(), p3.copy()];
    this.rebuildEdges();
    return this;
  }

  /**
   * 计算从指定顶点到对边的高（垂线长度）
   *
   * @param vertex - 必须是三角形的某个顶点
   * @returns 从 vertex 到对边的垂直距离
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
   * 判断三角形类型
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
   * 获取三角形的重心
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
   * 获取三角形的外心
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
  public toJSON(): any {
    return {
      id: this.id,
      type: this.type,
      controlPoints: this.controlPoints.map(v => v.toJSON()),
      style: this.style.toJSON(),
    }
  }

  public static fromJSON(data: any): Triangle {
    const points = data.controlPoints.map((v: any) => Point3.fromJSON(v))
    const style = Style.fromJSON(data.style)
    const triangle = new Triangle(points[0], points[1], points[2], style)
    triangle.id = data.id
    return triangle
  }

  /**
   * 复制三角形
   */
  public copy(): this {
    const [p0, p1, p2] = this.controlPoints
    return new Triangle(p0.copy(), p1.copy(), p2.copy(), this.style.copy()) as this;
  }

  /**
   * 创建等边三角形
   */
  public static createEquilateral(center: Point3, sideLength: number, style?: Style): Triangle {
    const height = (sideLength * Math.sqrt(3)) / 2;
    const p1 = new Point3(center.x, center.y - (height * 2) / 3, center.z);
    const p2 = new Point3(center.x - sideLength / 2, center.y + (height * 1) / 3, center.z);
    const p3 = new Point3(center.x + sideLength / 2, center.y + (height * 1) / 3, center.z);
    return new Triangle(p1, p2, p3, style);
  }

  /**
   * 创建等腰三角形
   */
  public static createIsosceles(center: Point3, base: number, height: number, style?: Style): Triangle {
    const p1 = new Point3(center.x, center.y - height / 2, center.z);
    const p2 = new Point3(center.x - base / 2, center.y + height / 2, center.z);
    const p3 = new Point3(center.x + base / 2, center.y + height / 2, center.z);
    return new Triangle(p1, p2, p3, style);
  }

  /**
   * 创建直角三角形
   */
  public static createRight(center: Point3, width: number, height: number, style?: Style): Triangle {
    const p1 = new Point3(center.x - width / 2, center.y - height / 2, center.z);
    const p2 = new Point3(center.x + width / 2, center.y - height / 2, center.z);
    const p3 = new Point3(center.x - width / 2, center.y + height / 2, center.z);
    return new Triangle(p1, p2, p3, style);
  }
}
