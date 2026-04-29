import { GRAPHTYPE } from "@/core/constants";
import AnalyticGraph from "./AnalyticGraph";
import { Point3, Vector3, Matrix4 } from "@/core/math";
import { Style } from "@/core/style";
import MathUtils from "@/core/math/MathUtils";
import Bounds from "@/core/graph/base/Bounds";
import Graph from "@/core/graph/base/Graph";
import { intersect } from "./IntersectionUtils";
import { ILine } from '@/core/interfaces';
import type { ISerializable } from '@/core/interfaces';
import { generateId } from '@/core/utils';

export default class Line extends AnalyticGraph implements ILine, ISerializable {
  public type: GRAPHTYPE = GRAPHTYPE.LINE;
  public controlPoints: Point3[];
  public style: Style;
  public bounds: Bounds;
  public transfromOrigin: Point3;

  constructor(startPoint: Point3, endPoint: Point3, style: Style = Style.DEFAULT, id?: string) {
    super(id);
    this.controlPoints = [startPoint, endPoint];
    this.style = style;
    this.transfromOrigin = this.getPointAt(0.5)

    // 在构造函数中立即计算边界框，确保View能获取到正确的初始尺寸
    this.bounds = this.updateBounds()
    if (!id) this.id = generateId(this.type)
  }

  // 获取起始点
  get startPoint(): Point3 {
    return this.controlPoints[0];
  }

  // 获取结束点
  get endPoint(): Point3 {
    return this.controlPoints[1];
  }

  // 设置起始点
  set startPoint(point: Point3) {
    this.controlPoints[0] = point;
    this.updateBounds()
  }

  // 设置结束点
  set endPoint(point: Point3) {
    this.controlPoints[1] = point;
    this.updateBounds()
  }


  // 计算线条的包围盒
  public updateBounds(orientationX?: boolean, orientationY?: boolean): Bounds {
    return Bounds.fromPoints(this.controlPoints, orientationX ?? this.endPoint.x - this.startPoint.x > 0, orientationY ?? this.endPoint.y - this.startPoint.y > 0)
  }

  public renderPath(ctx: CanvasRenderingContext2D, dependent: Boolean): void {
    dependent && ctx.beginPath();
    ctx.moveTo(this.startPoint.x, this.startPoint.y);
    ctx.lineTo(this.endPoint.x, this.endPoint.y);
  }

  // 渲染线条
  public render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    const bounds = this.bounds
    this.style.applyToContext(ctx, bounds.width, bounds.height);
    this.renderPath(ctx, true);
    ctx.stroke();
    ctx.restore();
  }

  // ── 序列化 ──
  toJSON(): any {
    return {
      id: this.id,
      type: this.type,
      controlPoints: this.controlPoints.map(p => p.toJSON()),
      style: this.style.toJSON(),
    }
  }

  static fromJSON(data: any): Line {
    const points = data.controlPoints.map((p: any) => Point3.fromJSON(p));
    const line = new Line(points[0], points[1], Style.fromJSON(data.style));
    line.id = data.id;
    return line;
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
        distance: point.distance(this.startPoint),
        closestPoint: this.startPoint.copy(),
        parameter: 0,
      };
    }

    const t = Math.max(0, Math.min(1, pointVector.dot(lineVector) / lineLengthSquared));
    const closestPoint = this.getPointAt(t);
    const distance = point.distance(closestPoint);

    return {
      distance,
      closestPoint,
      parameter: t,
    };
  }

  /**
   * 计算线条在指定参数范围内的长度
   */
  public getLength(tStart: number, tEnd: number): number {
    const startPoint = this.getPointAt(tStart);
    const endPoint = this.getPointAt(tEnd);
    return startPoint.distance(endPoint);
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
    const transfromOrigin = this.transfromOrigin
    const transformedStart = matrix.multiply(this.startPoint.add(Point3.origin.subtract(transfromOrigin))).add(transfromOrigin.subtract(Point3.origin));
    const transformedEnd = matrix.multiply(this.endPoint.add(Point3.origin.subtract(transfromOrigin))).add(transfromOrigin.subtract(Point3.origin));
    this.controlPoints[0] = transformedStart;
    this.controlPoints[1] = transformedEnd;
    this.bounds = this.updateBounds()
    return this;
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

  // TODO: 将参数变为1个resizeVector，其余维度graph不关心
  public resize(fixedPoint: Point3, dynamicPoint: Point3, resizeVector: Vector3): void {
    const referenceVector = dynamicPoint.subtract(fixedPoint)
    // TODO: 此时不应该使用viewport作为参考系，而是该采用内容包围盒
    let width = Math.abs(referenceVector.x) || Infinity
    let height = Math.abs(referenceVector.y) || Infinity
    // 变化比例：(dimension + delta) / dimension
    const scaleX = 1 + resizeVector.x * Math.sign(referenceVector.x) / width;
    const scaleY = 1 + resizeVector.y * Math.sign(referenceVector.y) / height;
    for (const [i, p] of this.controlPoints.entries()) {
      this.controlPoints[i] = new Point3(p.x * scaleX, p.y * scaleY, 0)
    }

    this.bounds = this.updateBounds()
  }
}

