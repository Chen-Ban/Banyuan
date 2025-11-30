import { GRAPHTYPE } from "@/core/constants";
import Bezier from "./Bezier";
import AnalyticGraph from "./AnalyticGraph";
import { Point3, Vector3, Matrix4 } from "@/core/math";
import { Style } from "@/core/style";

export default class CubicBezier extends Bezier {
  public type: GRAPHTYPE = GRAPHTYPE.CUBIC_BEZIER;

  constructor(
    startPoint: Point3,
    controlPoint1: Point3,
    controlPoint2: Point3,
    endPoint: Point3,
    style: Style = Style.DEFAULT
  ) {
    super([startPoint, controlPoint1, controlPoint2, endPoint], style);
  }

  // 获取第一个控制点
  get controlPoint1(): Point3 {
    return this.controlPoints[1];
  }

  // 获取第二个控制点
  get controlPoint2(): Point3 {
    return this.controlPoints[2];
  }

  // 设置第一个控制点
  setControlPoint1(controlPoint1: Point3): CubicBezier {
    this.controlPoints[1] = controlPoint1;
    return this;
  }

  // 设置第二个控制点
  setControlPoint2(controlPoint2: Point3): CubicBezier {
    this.controlPoints[2] = controlPoint2;
    return this;
  }

  // 设置指定位置的控制点（重写基类方法）
  setControlPoint(index: number, point: Point3): CubicBezier {
    if (index >= 0 && index < this.controlPoints.length) {
      this.controlPoints[index] = point;
    }
    return this;
  }

  // 计算三次贝塞尔曲线上的点
  public getPointAt(t: number): Point3 {
    const clampedT = Math.max(0, Math.min(1, t));
    const start = this.controlPoints[0];
    const control1 = this.controlPoints[1];
    const control2 = this.controlPoints[2];
    const end = this.controlPoints[3];

    // 三次贝塞尔曲线公式: B(t) = (1-t)³P₀ + 3(1-t)²tP₁ + 3(1-t)t²P₂ + t³P₃
    const oneMinusT = 1 - clampedT;
    const oneMinusTCubed = oneMinusT * oneMinusT * oneMinusT;
    const threeOneMinusTSquaredT = 3 * oneMinusT * oneMinusT * clampedT;
    const threeOneMinusTTsquared = 3 * oneMinusT * clampedT * clampedT;
    const tCubed = clampedT * clampedT * clampedT;

    const x =
      oneMinusTCubed * start.x +
      threeOneMinusTSquaredT * control1.x +
      threeOneMinusTTsquared * control2.x +
      tCubed * end.x;
    const y =
      oneMinusTCubed * start.y +
      threeOneMinusTSquaredT * control1.y +
      threeOneMinusTTsquared * control2.y +
      tCubed * end.y;
    const z =
      oneMinusTCubed * start.z +
      threeOneMinusTSquaredT * control1.z +
      threeOneMinusTTsquared * control2.z +
      tCubed * end.z;

    return new Point3(x, y, z);
  }

  // 计算三次贝塞尔曲线的切线方向
  public getTangentAt(t: number): Vector3 {
    const clampedT = Math.max(0, Math.min(1, t));
    const start = this.controlPoints[0];
    const control1 = this.controlPoints[1];
    const control2 = this.controlPoints[2];
    const end = this.controlPoints[3];

    // 切线公式: B'(t) = 3(1-t)²(P₁-P₀) + 6(1-t)t(P₂-P₁) + 3t²(P₃-P₂)
    const oneMinusT = 1 - clampedT;
    const threeOneMinusTSquared = 3 * oneMinusT * oneMinusT;
    const sixOneMinusTT = 6 * oneMinusT * clampedT;
    const threeTSquared = 3 * clampedT * clampedT;

    const dx =
      threeOneMinusTSquared * (control1.x - start.x) +
      sixOneMinusTT * (control2.x - control1.x) +
      threeTSquared * (end.x - control2.x);
    const dy =
      threeOneMinusTSquared * (control1.y - start.y) +
      sixOneMinusTT * (control2.y - control1.y) +
      threeTSquared * (end.y - control2.y);
    const dz =
      threeOneMinusTSquared * (control1.z - start.z) +
      sixOneMinusTT * (control2.z - control1.z) +
      threeTSquared * (end.z - control2.z);

    return new Vector3(dx, dy, dz);
  }

  // 计算三次贝塞尔曲线的法线方向
  public getNormalAt(t: number): Vector3 {
    const tangent = this.getTangentAt(t);
    // 法线是切线的垂直方向
    return new Vector3(-tangent.y, tangent.x, 0);
  }

  // 计算指定参数范围内的弧长（AnalyticGraph 要求）
  public getLength(tStart: number, tEnd: number): number {
    const clampedStart = Math.max(0, Math.min(1, tStart));
    const clampedEnd = Math.max(0, Math.min(1, tEnd));

    if (clampedStart >= clampedEnd) return 0;

    const steps = 100;
    let length = 0;
    let prevPoint = this.getPointAt(clampedStart);

    for (let i = 1; i <= steps; i++) {
      const t = clampedStart + ((clampedEnd - clampedStart) * i) / steps;
      const currentPoint = this.getPointAt(t);
      const dx = currentPoint.x - prevPoint.x;
      const dy = currentPoint.y - prevPoint.y;
      length += Math.sqrt(dx * dx + dy * dy);
      prevPoint = currentPoint;
    }

    return length;
  }

  // 获取三次贝塞尔曲线的拐点
  getInflectionPoints(): Point3[] {
    const start = this.controlPoints[0];
    const control1 = this.controlPoints[1];
    const control2 = this.controlPoints[2];
    const end = this.controlPoints[3];

    // 计算拐点的t值
    // 拐点出现在二阶导数为0的地方
    const a = end.x - 3 * control2.x + 3 * control1.x - start.x;
    const b = 3 * (control2.x - 2 * control1.x + start.x);
    const c = 3 * (control1.x - start.x);

    const inflectionPoints: Point3[] = [];

    if (Math.abs(a) < 1e-10) {
      // 二次方程情况
      if (Math.abs(b) > 1e-10) {
        const t = -c / b;
        if (t >= 0 && t <= 1) {
          inflectionPoints.push(this.getPointAt(t));
        }
      }
    } else {
      // 三次方程情况
      const discriminant = b * b - 4 * a * c;
      if (discriminant >= 0) {
        const sqrtDiscriminant = Math.sqrt(discriminant);
        const t1 = (-b + sqrtDiscriminant) / (2 * a);
        const t2 = (-b - sqrtDiscriminant) / (2 * a);

        if (t1 >= 0 && t1 <= 1) {
          inflectionPoints.push(this.getPointAt(t1));
        }
        if (t2 >= 0 && t2 <= 1) {
          inflectionPoints.push(this.getPointAt(t2));
        }
      }
    }

    return inflectionPoints;
  }

  // 检查三次贝塞尔曲线是否是直线
  isLinear(): boolean {
    const start = this.controlPoints[0];
    const control1 = this.controlPoints[1];
    const control2 = this.controlPoints[2];
    const end = this.controlPoints[3];

    // 检查所有控制点是否在起始点和结束点的连线上
    const crossProduct1 = (control1.x - start.x) * (end.y - start.y) - (control1.y - start.y) * (end.x - start.x);
    const crossProduct2 = (control2.x - start.x) * (end.y - start.y) - (control2.y - start.y) * (end.x - start.x);

    return Math.abs(crossProduct1) < 1e-10 && Math.abs(crossProduct2) < 1e-10;
  }

  // 复制三次贝塞尔曲线
  public copy(): this {
    return new CubicBezier(
      this.controlPoints[0].copy(),
      this.controlPoints[1].copy(),
      this.controlPoints[2].copy(),
      this.controlPoints[3].copy(),
      this.style.copy()
    ) as this;
  }

  // 计算与另一条解析式图形的交点（AnalyticGraph 要求）
  public getIntersections(other: AnalyticGraph): Point3[] {
    // 简化的交点计算，使用数值方法
    const intersections: Point3[] = [];
    const steps = 100;

    for (let i = 0; i < steps; i++) {
      const t1 = i / steps;
      const point1 = this.getPointAt(t1);

      for (let j = 0; j < steps; j++) {
        const t2 = j / steps;
        const point2 = other.getPointAt(t2);

        const dx = point1.x - point2.x;
        const dy = point1.y - point2.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 1e-6) {
          intersections.push(point1);
        }
      }
    }

    return intersections;
  }

  public getArea(): number {
    return 0;
  }

  // 应用变换矩阵（AnalyticGraph 要求）
  public transform(matrix: Matrix4): AnalyticGraph {
    const p0 = matrix.multiply(this.controlPoints[0]);
    const p1 = matrix.multiply(this.controlPoints[1]);
    const p2 = matrix.multiply(this.controlPoints[2]);
    const p3 = matrix.multiply(this.controlPoints[3]);
    this.controlPoints[0] = p0;
    this.controlPoints[1] = p1;
    this.controlPoints[2] = p2;
    this.controlPoints[3] = p3;
    this.setBounds(this.calculateBounds());
    return this;
  }
}

// 类型守卫函数
export function isCubicBezier(graph: any): graph is CubicBezier {
  return graph instanceof CubicBezier;
}