import { GRAPHTYPE } from "@/core/constants";
import AnalyticGraph from "./AnalyticGraph";
import { Matrix4, Point3, Vector3 } from "@/core/math";
import { Style } from "@/core/style";
import Bounds from "../base/Bounds";
import Graph from "../base/Graph";
import { intersect } from "./IntersectionUtils";

export default abstract class Bezier extends AnalyticGraph {
  public type: GRAPHTYPE = GRAPHTYPE.BEZIER;
  public controlPoints: Point3[];
  public style: Style;
  public bounds: Bounds;
  public transfromOrigin: Point3;

  constructor(controlPoints: Point3[], style: Style = Style.DEFAULT, id?: string) {
    super(id);
    this.controlPoints = controlPoints;
    this.style = style;
    this.transfromOrigin = this.getCentroid()
    this.bounds = this.updateBounds()
  }

  // 计算贝塞尔曲线的包围盒（等参数采样）
  public updateBounds(orientationX?: boolean, orientationY?: boolean): Bounds {
    if (this.controlPoints.length === 0) {
      return Bounds.empty();
    }

    const length = this.getTotalLength();
    const points: Point3[] = [];
    for (const i of Array.from({ length }).map((_, i) => i)) {
      const point = this.getPointAt(i / length);
      points.push(point);
    }
    points.push()
    return Bounds.fromPoints(points, orientationX ?? this.controlPoints[-1].x - this.controlPoints[0].x > 0, orientationY ?? this.controlPoints[-1].y - this.controlPoints[0].y > 0)
  }

  // 获取起始点
  get startPoint(): Point3 {
    return this.controlPoints[0];
  }

  // 获取结束点
  get endPoint(): Point3 {
    return this.controlPoints[this.controlPoints.length - 1];
  }

  // 设置控制点
  setControlPoints(controlPoints: Point3[]): Bezier {
    this.controlPoints = controlPoints;
    this.bounds = this.updateBounds()
    return this;
  }

  // 获取指定位置的控制点
  getControlPoint(index: number): Point3 | null {
    if (index < 0 || index >= this.controlPoints.length) {
      return null;
    }
    return this.controlPoints[index];
  }

  // 设置指定位置的控制点
  setControlPoint(index: number, point: Point3): Bezier {
    if (index >= 0 && index < this.controlPoints.length) {
      this.controlPoints[index] = point;
    }
    this.bounds = this.updateBounds()
    return this;
  }

  // 计算贝塞尔曲线的近似长度（使用数值积分）
  protected calculateApproximateLength(steps: number = 100): number {
    let length = 0;
    let prevPoint = this.getPointAt(0);

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const currentPoint = this.getPointAt(t);
      const dx = currentPoint.x - prevPoint.x;
      const dy = currentPoint.y - prevPoint.y;
      length += Math.sqrt(dx * dx + dy * dy);
      prevPoint = currentPoint;
    }

    return length;
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
    this.style.applyToContext(ctx, bounds.width, bounds.height);
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
    const centroid = this.getCentroid()
    for (const [i] of this.controlPoints.entries()) {
      this.controlPoints[i] = matrix.multiply(this.controlPoints[i].add(Point3.orgin.subtract(centroid))).add(centroid.subtract(Point3.orgin));
    }
    this.bounds = this.updateBounds()
    return this;
  }

  public resize(fixedPoint: Point3, dynamicPoint: Point3, resizeVector: Vector3): void {

    const width = Math.abs(fixedPoint.x - dynamicPoint.x) || Infinity;
    const height = Math.abs(fixedPoint.y - dynamicPoint.y) || Infinity;

    for (const p of this.controlPoints) {
      // 变化比例，TOFIX： 缩放比例应该和坐标无关（需要将referenceVector拆分成两个点，这样甚至不用判断，直接取固定点）
      const scaleX = Math.abs(p.x - fixedPoint.x) / width;
      const scaleY = Math.abs(p.y - fixedPoint.y) / height;

      // 带方向并且按照介质尺寸缩放的移动量
      const dx = resizeVector.x * scaleX;
      const dy = resizeVector.y * scaleY;

      p.add(new Vector3(dx, dy, 0))
    }

    this.bounds = this.updateBounds()
  }
}
