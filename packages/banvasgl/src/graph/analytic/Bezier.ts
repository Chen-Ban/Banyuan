import { GRAPHTYPE } from "@/foundation/constants";
import AnalyticGraph from "./AnalyticGraph";
import { Matrix4, MathUtils, Point3, Vector3 } from "@/foundation/math";
import { Style } from "@/foundation/style";
import Bounds from "@/graph/base/Bounds";
import Graph from "@/graph/base/Graph";
import { intersect } from "@/graph/algorithm/IntersectionUtils";
import { IBezier } from '@/types';

export default abstract class Bezier extends AnalyticGraph implements IBezier {
  public type: GRAPHTYPE = GRAPHTYPE.BEZIER;
  public controlPoints: Point3[];
  public style: Style;
  public bounds: Bounds;

  constructor(controlPoints: Point3[], style: Style = Style.DEFAULT, id?: string) {
    super(id);
    this.controlPoints = controlPoints;
    this.style = style;
    this.bounds = this.updateBounds()
  }

  public isClosed(): boolean {
    if (this.controlPoints.length < 2) return false;
    const first = this.controlPoints[0];
    const last = this.controlPoints[this.controlPoints.length - 1];
    return first.distance(last) < MathUtils.EPSILON;
  }

  // 计算贝塞尔曲线的包围盒（等参数采样）
  public updateBounds(): Bounds {
    if (this.controlPoints.length === 0) {
      return Bounds.empty();
    }

    const length = this.getTotalLength();
    const points: Point3[] = [];
    for (const i of Array.from({ length }).map((_, i) => i)) {
      const point = this.getPointAt(i / length);
      points.push(point);
    }
    points.push(this.getPointAt(1))
    return Bounds.fromPoints(points)
  }

  // 获取起始点
  get startPoint(): Point3 {
    return this.controlPoints[0];
  }

  // 获取结束点
  get endPoint(): Point3 {
    return this.controlPoints[this.controlPoints.length - 1];
  }

  // 设置控制点（批量）
  setControlPoints(controlPoints: Point3[]): Bezier {
    this.controlPoints = controlPoints;
    this.bounds = this.updateBounds()
    return this;
  }

  /**
   * 设置指定索引的单个控制点
   */
  public setControlPoint(index: number, point: Point3): void {
    if (index < 0 || index >= this.controlPoints.length) return
    this.controlPoints[index] = point.copy()
    this.bounds = this.updateBounds()
  }

  // 获取指定位置的控制点
  getControlPoint(index: number): Point3 | null {
    if (index < 0 || index >= this.controlPoints.length) {
      return null;
    }
    return this.controlPoints[index];
  }


  // ── 自适应 Simpson 积分求弧长（通用实现，子类可重写以提供解析版本） ──
  public getLength(tStart: number, tEnd: number): number {
    const clampedStart = Math.max(0, Math.min(1, tStart));
    const clampedEnd = Math.max(0, Math.min(1, tEnd));
    if (clampedStart >= clampedEnd) return 0;

    // 被积函数 ds/dt = |dP/dt|
    const speed = (t: number): number => {
      const dt = MathUtils.DERIVATIVE_STEP;
      const t0 = Math.max(clampedStart, t - dt);
      const t1 = Math.min(clampedEnd, t + dt);
      const p0 = this.getPointAt(t0);
      const p1 = this.getPointAt(t1);
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      return Math.sqrt(dx * dx + dy * dy) / (t1 - t0);
    };

    const simpson = (a: number, b: number, fa: number, fm: number, fb: number): number => {
      return ((b - a) / 6) * (fa + 4 * fm + fb);
    };

    const adaptiveSimpson = (
      a: number, b: number,
      fa: number, fm: number, fb: number,
      whole: number, eps: number, depth: number,
    ): number => {
      const m = (a + b) / 2;
      const lm = (a + m) / 2;
      const rm = (m + b) / 2;
      const flm = speed(lm);
      const frm = speed(rm);
      const left = simpson(a, m, fa, flm, fm);
      const right = simpson(m, b, fm, frm, fb);
      const refined = left + right;
      if (depth <= 0 || Math.abs(refined - whole) <= 15 * eps) {
        return refined + (refined - whole) / 15;
      }
      return (
        adaptiveSimpson(a, m, fa, flm, fm, left, eps / 2, depth - 1) +
        adaptiveSimpson(m, b, fm, frm, fb, right, eps / 2, depth - 1)
      );
    };

    const fa = speed(clampedStart);
    const fb = speed(clampedEnd);
    const fm = speed((clampedStart + clampedEnd) / 2);
    const whole = simpson(clampedStart, clampedEnd, fa, fm, fb);

    return adaptiveSimpson(clampedStart, clampedEnd, fa, fm, fb, whole, MathUtils.INTEGRATION_TOLERANCE, 12);
  }

  // 法线方向：切线逆时针旋转 90°
  public getNormalAt(t: number): Vector3 {
    const tangent = this.getTangentAt(t);
    return new Vector3(-tangent.y, tangent.x, 0);
  }

  // 面积：闭合贝塞尔可通过 Shoelace 公式近似，非闭合则抛异常
  public getArea(): number {
    if (!this.isClosed()) {
      throw new Error('Bezier 是开放路径，不具有面积');
    }
    // Shoelace 公式的参数化版本
    const steps = 200;
    let area = 0;
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const p0 = this.getPointAt(t0);
      const p1 = this.getPointAt(t1);
      area += (p0.x * p1.y - p1.x * p0.y);
    }
    return Math.abs(area) / 2;
  }

  // 检查贝塞尔曲线是否退化为直线（所有中间控制点在首尾连线上）
  public isLinear(): boolean {
    if (this.controlPoints.length < 3) return true;
    const start = this.controlPoints[0];
    const end = this.controlPoints[this.controlPoints.length - 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    for (let i = 1; i < this.controlPoints.length - 1; i++) {
      const cp = this.controlPoints[i];
      const cross = (cp.x - start.x) * dy - (cp.y - start.y) * dx;
      if (Math.abs(cross) >= MathUtils.FLOAT_EPSILON) return false;
    }
    return true;
  }

  public getClosestPoint(point: Point3): {
    distance: number;
    closestPoint: Point3;
    parameter: number;
  } {
    let closestPoint = this.getPointAt(0);
    let closestT = 0;
    let minDistance = Infinity;
    const steps = 100;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const curvePoint = this.getPointAt(t);
      const dx = point.x - curvePoint.x;
      const dy = point.y - curvePoint.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < minDistance) {
        minDistance = distance;
        closestPoint = curvePoint;
        closestT = t;
      }
    }

    return {
      closestPoint: closestPoint,
      parameter: closestT,
      distance: minDistance,
    };
  }

  public renderPath(ctx: CanvasRenderingContext2D, dependent: Boolean): void {
    dependent && ctx.beginPath();
    ctx.moveTo(this.startPoint.x, this.startPoint.y);

    // 使用二次贝塞尔曲线或三次贝塞尔曲线
    if (this.controlPoints.length === 3) {
      // 二次贝塞尔曲线
      ctx.quadraticCurveTo(this.controlPoints[1].x, this.controlPoints[1].y, this.endPoint.x, this.endPoint.y);
    } else if (this.controlPoints.length === 4) {
      // 三次贝塞尔曲线
      ctx.bezierCurveTo(
        this.controlPoints[1].x,
        this.controlPoints[1].y,
        this.controlPoints[2].x,
        this.controlPoints[2].y,
        this.endPoint.x,
        this.endPoint.y
      );
    }
  }

  // 渲染贝塞尔曲线
  public render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    const bounds = this.bounds;
    this.style.applyToContext(ctx, Math.abs(bounds.width), Math.abs(bounds.height));
    this.renderPath(ctx, true);
    ctx.stroke();
    ctx.restore();
  }

  // 获取贝塞尔曲线的类型
  public getBezierType(): string {
    return this.controlPoints.length === 3 ? "quadratic" : this.controlPoints.length === 4 ? "cubic" : "unknown";
  }

  // 质心（对 t∈[0,1] 的均匀平均）：等于控制点的算术平均
  public getCentroid(): Point3 {
    if (this.controlPoints.length === 0) return new Point3(0, 0, 0);
    let sumX = 0,
      sumY = 0,
      sumZ = 0;
    for (const p of this.controlPoints) {
      sumX += p.x;
      sumY += p.y;
      sumZ += p.z;
    }
    const n = this.controlPoints.length;
    return new Point3(sumX / n, sumY / n, sumZ / n);
  }

  /**
   * 计算与另一个图形的相交点
   * @param other 另一个图形
   * @returns 相交点数组
   */
  public intersect(other: Graph): Point3[] {
    // 如果另一个图形也是可分析图形，使用精确的相交计算方法
    if (other instanceof AnalyticGraph) {
      return intersect(this, other);
    }
    // 对于其他类型的图形，使用其他图形的相交计算方法
    return other.intersect(this);
  }
  public transform(matrix: Matrix4): Graph {
    for (const [i] of this.controlPoints.entries()) {
      this.controlPoints[i] = matrix.multiply(this.controlPoints[i]);
    }
    this.bounds = this.updateBounds()
    return this;
  }

  public resize(fixedPoint: Point3, dynamicPoint: Point3, resizeVector: Vector3): void {

    const width = Math.abs(fixedPoint.x - dynamicPoint.x) || Infinity;
    const height = Math.abs(fixedPoint.y - dynamicPoint.y) || Infinity;

    for (const [i, p] of this.controlPoints.entries()) {
      // 变化比例，TOFIX： 缩放比例应该和坐标无关（需要将referenceVector拆分成两个点，这样甚至不用判断，直接取固定点）
      const scaleX = Math.abs(p.x - fixedPoint.x) / width;
      const scaleY = Math.abs(p.y - fixedPoint.y) / height;

      // 带方向并且按照介质尺寸缩放的移动量
      const dx = resizeVector.x * scaleX;
      const dy = resizeVector.y * scaleY;

      this.controlPoints[i] = p.add(new Vector3(dx, dy, 0))
    }

    this.bounds = this.updateBounds()
  }
}
