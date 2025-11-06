import { GRAPHTYPE } from "@/core/constants";
import AnalyticGraph from "./AnalyticGraph";
import { Point3, Vector3 } from "@/core/math";
import { Style } from "@/core/style";
import Bounds from "../base/Bounds";

export default abstract class Bezier extends AnalyticGraph {
  public type: GRAPHTYPE = GRAPHTYPE.BEZIER;
  public controlPoints: Point3[];
  public style: Style;

  constructor(controlPoints: Point3[], style: Style = Style.DEFAULT) {
    super();
    this.controlPoints = controlPoints;
    this.style = style;

    // 在构造函数中立即计算边界框，确保View能获取到正确的初始尺寸
    this.setBounds(this.calculateBounds());
  }

  // 计算贝塞尔曲线的包围盒（等参数采样）
  protected calculateBounds(): Bounds {
    if (this.controlPoints.length === 0) {
      return Bounds.empty();
    }

    const steps = 64;
    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const p = this.getPointAt(t);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }

    return new Bounds(minX, minY, maxX - minX, maxY - minY);
  }

  // 获取起始点
  get startPoint(): Point3 {
    return this.controlPoints[0];
  }

  // 获取结束点
  get endPoint(): Point3 {
    return this.controlPoints[this.controlPoints.length - 1];
  }

  // 获取控制点数量
  get controlPointCount(): number {
    return this.controlPoints.length;
  }

  // 设置控制点
  setControlPoints(controlPoints: Point3[]): Bezier {
    this.controlPoints = controlPoints;
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

  public isPointOnCurve(point: Point3, tolerance: number = 1e-6): boolean {
    const steps = 100;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const curvePoint = this.getPointAt(t);
      const dx = point.x - curvePoint.x;
      const dy = point.y - curvePoint.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= tolerance) {
        return true;
      }
    }
    return false;
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
    const bounds = this.getBounds();
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
}
