import { GRAPHTYPE } from "@/core/constants";
import AnalyticGraph from "./AnalyticGraph";
import { Point3, Vector3, Matrix4 } from "@/core/math";
import { Style } from "@/core/style";
import MathUtils from "@/core/math/MathUtils";
import Bounds from "../base/Bounds";

export default class Line extends AnalyticGraph {
  public type: GRAPHTYPE = GRAPHTYPE.LINE;
  public controlPoints: Point3[];
  public style: Style;

  constructor(startPoint: Point3, endPoint: Point3, style: Style = Style.DEFAULT) {
    super();
    this.controlPoints = [startPoint, endPoint];
    this.style = style;

    // 在构造函数中立即计算边界框，确保View能获取到正确的初始尺寸
    this.setBounds(this.calculateBounds());
  }

  // 获取起始点
  get startPoint(): Point3 {
    return this.controlPoints[0];
  }

  // 获取结束点
  get endPoint(): Point3 {
    return this.controlPoints[1];
  }

  // 计算线条的包围盒
  public calculateBounds(): Bounds {
    const startPoint = this.controlPoints[0];
    const endPoint = this.controlPoints[1];

    const minX = Math.min(startPoint.x, endPoint.x);
    const maxX = Math.max(startPoint.x, endPoint.x);
    const minY = Math.min(startPoint.y, endPoint.y);
    const maxY = Math.max(startPoint.y, endPoint.y);

    return new Bounds(minX, minY, maxX - minX, maxY - minY);
  }

  // 设置起始点
  setStartPoint(point: Point3): Line {
    this.controlPoints[0] = point;
    return this;
  }

  // 设置结束点
  setEndPoint(point: Point3): Line {
    this.controlPoints[1] = point;
    return this;
  }

  public renderPath(ctx: CanvasRenderingContext2D, dependent: Boolean): void {
    dependent && ctx.beginPath();
    ctx.moveTo(this.startPoint.x, this.startPoint.y);
    ctx.lineTo(this.endPoint.x, this.endPoint.y);
  }

  // 渲染线条
  public render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    const bounds = this.getBounds();
    this.style.applyToContext(ctx, bounds.width, bounds.height);
    this.renderPath(ctx, true);
    ctx.stroke();
    ctx.restore();
  }

  // 复制线条
  public copy(): this {
    return new Line(this.startPoint.copy(), this.endPoint.copy(), this.style.copy()) as this;
  }

  // ========== AnalyticGraph 抽象方法实现 ==========

  /**
   * 获取线条上指定参数t处的点
   */
  public getPointAt(t: number): Point3 {
    const start = this.startPoint;
    const end = this.endPoint;
    return new Point3(
      start.x + t * (end.x - start.x),
      start.y + t * (end.y - start.y),
      start.z + t * (end.z - start.z)
    );
  }

  /**
   * 获取线条上指定参数t处的切线向量
   */
  public getTangentAt(t: number): Vector3 {
    const start = this.startPoint;
    const end = this.endPoint;
    return new Vector3(end.x - start.x, end.y - start.y, end.z - start.z);
  }

  /**
   * 获取线条上指定参数t处的法向量
   */
  public getNormalAt(t: number): Vector3 {
    const tangent = this.getTangentAt(t);
    return new Vector3(-tangent.y, tangent.x, 0).normalized;
  }

  /**
   * 计算点到线条的最短距离，并返回最近点
   */
  public getClosestPoint(point: Point3): {
    distance: number;
    closestPoint: Point3;
    parameter: number;
  } {
    const lineVector = this.endPoint.subtract(this.startPoint);
    const pointVector = point.subtract(this.startPoint);

    const lineLengthSquared = lineVector.dot(lineVector);
    if (MathUtils.isZero(lineLengthSquared)) {
      return {
        distance: MathUtils.distance(point, this.startPoint),
        closestPoint: this.startPoint.copy(),
        parameter: 0,
      };
    }

    const t = Math.max(0, Math.min(1, pointVector.dot(lineVector) / lineLengthSquared));
    const closestPoint = this.getPointAt(t);
    const distance = MathUtils.distance(point, closestPoint);

    return {
      distance,
      closestPoint,
      parameter: t,
    };
  }

  /**
   * 计算线条与另一条解析式图形的交点
   */
  public getIntersections(other: AnalyticGraph): Point3[] {
    if (other instanceof Line) {
      const intersection = MathUtils.lineIntersection(this.startPoint, this.endPoint, other.startPoint, other.endPoint);
      return intersection ? [intersection] : [];
    }

    // 对于其他类型的图形，使用数值方法求解
    const intersections: Point3[] = [];
    const numSamples = 100;

    for (let i = 0; i < numSamples; i++) {
      const t = i / (numSamples - 1);
      const point = this.getPointAt(t);
      const distance = other.getClosestPoint(point).distance;

      if (distance < 1e-6) {
        intersections.push(point);
      }
    }

    return intersections;
  }

  /**
   * 计算线条在指定参数范围内的长度
   */
  public getLength(tStart: number, tEnd: number): number {
    const startPoint = this.getPointAt(tStart);
    const endPoint = this.getPointAt(tEnd);
    return MathUtils.distance(startPoint, endPoint);
  }

  /**
   * 计算线条的包围盒
   */
  public getBoundingBox(): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } {
    const start = this.startPoint;
    const end = this.endPoint;
    return {
      minX: Math.min(start.x, end.x),
      minY: Math.min(start.y, end.y),
      maxX: Math.max(start.x, end.x),
      maxY: Math.max(start.y, end.y),
    };
  }

  /**
   * 计算线条的面积（直线面积为0）
   */
  public getArea(): number {
    return 0;
  }

  /**
   * 计算线条的质心
   */
  public getCentroid(): Point3 {
    return new Point3(
      (this.startPoint.x + this.endPoint.x) / 2,
      (this.startPoint.y + this.endPoint.y) / 2,
      (this.startPoint.z + this.endPoint.z) / 2
    );
  }

  /**
   * 应用变换矩阵到线条
   */
  public transform(matrix: Matrix4): AnalyticGraph {
    const transformedStart = matrix.multiply(this.startPoint);
    const transformedEnd = matrix.multiply(this.endPoint);
    this.controlPoints[0] = transformedStart;
    this.controlPoints[1] = transformedEnd;
    this.setBounds(this.calculateBounds());
    return this;
  }
}

// 类型守卫函数
export function isLine(graph: any): graph is Line {
  return graph instanceof Line;
}