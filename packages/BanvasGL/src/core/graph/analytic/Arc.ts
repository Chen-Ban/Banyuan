import { GRAPHTYPE } from "@/core/constants";
import AnalyticGraph from "./AnalyticGraph";
import { Point3, Vector3, Matrix4 } from "@/core/math";
import { Style } from "@/core/style";
import Bounds from "@/core/graph/base/Bounds";
import Graph from "@/core/graph/base/Graph";
import { intersect } from "./IntersectionUtils";
import type { IArc } from '@/core/interfaces';

export default class Arc extends AnalyticGraph implements IArc {
  public type: GRAPHTYPE = GRAPHTYPE.ARC;
  public controlPoints: Point3[];
  public style: Style;
  public bounds: Bounds;
  public transfromOrigin: Point3;

  // 椭圆弧属性
  public center: Point3;
  public xRadius: number; // X轴半径
  public yRadius: number; // Y轴半径
  public rotation: number; // 旋转角度（弧度）
  public startAngle: number; // 起始角度（弧度）
  public endAngle: number; // 结束角度（弧度）
  public clockwise: boolean; // 是否顺时针

  constructor(
    center: Point3,
    xRadius: number,
    yRadius: number,
    rotation: number,
    startAngle: number,
    endAngle: number,
    clockwise: boolean = false,
    style: Style = Style.DEFAULT,
    id?: string
  ) {
    super(id);
    this.center = center;
    this.xRadius = Math.max(0, xRadius);
    this.yRadius = Math.max(0, yRadius);
    this.rotation = rotation;
    this.startAngle = startAngle;
    this.endAngle = endAngle;
    this.clockwise = clockwise;
    this.style = style;

    // 计算控制点（用于边界框计算）
    this.controlPoints = this.calculateControlPoints();
    this.transfromOrigin = center

    // 逆时针时为正向扩展
    this.bounds = this.updateBounds(!clockwise, !clockwise)
  }

  // 计算控制点
  protected calculateControlPoints(): Point3[] {
    const points: Point3[] = [];

    // 添加起始点（考虑椭圆和旋转）
    const startPoint = this.getPointAt(0);
    points.push(startPoint);

    // 添加结束点（考虑椭圆和旋转）
    const endPoint = this.getPointAt(1);
    points.push(endPoint);

    // 添加中心点
    points.push(this.center);

    return points;
  }

  // 标准化角度到0-2π范围
  private normalizeAngle(angle: number): number {
    while (angle < 0) angle += 2 * Math.PI;
    while (angle >= 2 * Math.PI) angle -= 2 * Math.PI;
    return angle;
  }

  // 设置中心点
  setCenter(center: Point3): Arc {
    this.center = center;
    this.controlPoints = this.calculateControlPoints();
    this.bounds = this.updateBounds()
    return this;
  }

  // 设置X轴半径
  setXRadius(xRadius: number): Arc {
    if (xRadius < 0) throw new Error('x半径不能为负数')
    this.xRadius = xRadius
    this.controlPoints = this.calculateControlPoints();
    this.bounds = this.updateBounds()
    return this;
  }

  // 设置Y轴半径
  setYRadius(yRadius: number): Arc {
    if (yRadius < 0) throw new Error('y半径不能为负数')
    this.yRadius = yRadius
    this.controlPoints = this.calculateControlPoints();
    this.bounds = this.updateBounds()
    return this;
  }

  // 设置旋转角度
  setRotation(rotation: number): Arc {
    this.rotation = rotation;
    this.controlPoints = this.calculateControlPoints();
    this.bounds = this.updateBounds()
    return this;
  }

  // 设置角度
  setAngles(startAngle: number, endAngle: number): Arc {
    this.startAngle = startAngle;
    this.endAngle = endAngle;
    this.controlPoints = this.calculateControlPoints();
    return this;
  }

  // 设置方向
  setClockwise(clockwise: boolean): Arc {
    this.clockwise = clockwise;
    return this;
  }

  // 获取起始点
  get startPoint(): Point3 {
    return this.controlPoints[0];
  }

  // 获取结束点
  get endPoint(): Point3 {
    return this.controlPoints[1];
  }

  public renderPath(ctx: CanvasRenderingContext2D, dependent: Boolean): void {
    dependent && ctx.beginPath();
    ctx.ellipse(
      this.center.x,
      this.center.y,
      this.xRadius,
      this.yRadius,
      this.rotation,
      this.startAngle,
      this.endAngle,
      this.clockwise
    );
  }

  // 渲染圆弧
  public render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    const bounds = this.bounds;
    this.style.applyToContext(ctx, bounds.width, bounds.height);
    this.renderPath(ctx, true);
    ctx.stroke();
    ctx.restore();
  }

  // 复制椭圆弧
  public copy(): this {
    return new Arc(
      this.center.copy(),
      this.xRadius,
      this.yRadius,
      this.rotation,
      this.startAngle,
      this.endAngle,
      this.clockwise,
      this.style.copy()
    ) as this;
  }

  // 计算椭圆弧的包围盒
  public updateBounds(orientationX?: boolean, orientationY?: boolean): Bounds {
    const length = this.getTotalLength();
    const points: Point3[] = [];
    for (const i of Array.from({ length }).map((_, i) => i)) {
      const point = this.getPointAt(i / length);
      points.push(point);
    }

    return Bounds.fromPoints(points, orientationX ?? this.bounds?.width > 0, orientationY ?? this.bounds?.height > 0)
  }

  private getParameterFromAngle(angle: number): number {
    const startNorm = this.normalizeAngle(this.startAngle);
    const endNorm = this.normalizeAngle(this.endAngle);
    const angleNorm = this.normalizeAngle(angle);

    if (this.clockwise) {
      if (angleNorm <= startNorm && angleNorm >= endNorm) {
        return (startNorm - angleNorm) / (startNorm - endNorm);
      }
    } else {
      if (angleNorm >= startNorm && angleNorm <= endNorm) {
        return (angleNorm - startNorm) / (endNorm - startNorm);
      }
    }

    return 0;
  }

  // ========== AnalyticGraph 抽象方法实现 ==========

  public getPointAt(t: number): Point3 {
    const angle = this.startAngle + t * (this.endAngle - this.startAngle);

    // 在局部坐标系中计算椭圆上的点
    const localX = this.xRadius * Math.cos(angle);
    const localY = this.yRadius * Math.sin(angle);
    const localPoint = Matrix4.identity().rotateZ(this.rotation).multiply(new Point3(localX, localY, 0));

    return localPoint.add(new Vector3(this.center.x, this.center.y, this.center.z));
  }

  public getTangentAt(t: number): Vector3 {
    const angle = this.startAngle + t * (this.endAngle - this.startAngle);

    // 在局部坐标系中的切线方向
    const localTangentX = -this.xRadius * Math.sin(angle);
    const localTangentY = this.yRadius * Math.cos(angle);

    // 应用旋转
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    const rotatedX = localTangentX * cos - localTangentY * sin;
    const rotatedY = localTangentX * sin + localTangentY * cos;

    // 归一化
    const length = Math.sqrt(rotatedX * rotatedX + rotatedY * rotatedY);
    if (length < 1e-10) {
      return new Vector3(0, 0, 0);
    }
    return new Vector3(rotatedX / length, rotatedY / length, 0);
  }

  public getNormalAt(t: number): Vector3 {
    const angle = this.startAngle + t * (this.endAngle - this.startAngle);

    // 在局部坐标系中的法线方向（指向椭圆中心）
    const localNormalX = this.xRadius * Math.cos(angle);
    const localNormalY = this.yRadius * Math.sin(angle);

    // 应用旋转
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    const rotatedX = localNormalX * cos - localNormalY * sin;
    const rotatedY = localNormalX * sin + localNormalY * cos;

    // 归一化
    const length = Math.sqrt(rotatedX * rotatedX + rotatedY * rotatedY);
    if (length < 1e-10) {
      return new Vector3(0, 0, 0);
    }
    return new Vector3(rotatedX / length, rotatedY / length, 0);
  }

  public getClosestPoint(point: Point3): {
    distance: number;
    closestPoint: Point3;
    parameter: number;
  } {
    // 将点转换到椭圆的局部坐标系
    const dx = point.x - this.center.x;
    const dy = point.y - this.center.y;
    const cos = Math.cos(-this.rotation);
    const sin = Math.sin(-this.rotation);
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;

    // 在局部坐标系中计算最近点（使用数值方法）
    let closestT = 0;
    let minDistance = Infinity;
    const numSamples = 100;

    for (let i = 0; i <= numSamples; i++) {
      const t = i / numSamples;
      const arcPoint = this.getPointAt(t);
      const distance = point.distance(arcPoint);
      if (distance < minDistance) {
        minDistance = distance;
        closestT = t;
      }
    }

    const closestPoint = this.getPointAt(closestT);
    const distance = point.distance(closestPoint);

    return { distance, closestPoint, parameter: closestT };
  }

  public getLength(tStart: number, tEnd: number): number {
    const angleDiff = Math.abs((tEnd - tStart) * (this.endAngle - this.startAngle));
    // 使用平均半径进行近似计算，待后续新增积分来计算精确长度
    const avgRadius = (this.xRadius + this.yRadius) / 2;
    return avgRadius * angleDiff;
  }

  public getArea(): number {
    const angleDiff = Math.abs(this.endAngle - this.startAngle);
    // 椭圆扇形面积
    return 0.5 * this.xRadius * this.yRadius * angleDiff;
  }

  public getCentroid(): Point3 {
    return this.controlPoints[2];
  }

  public transform(matrix: Matrix4): AnalyticGraph {
    const transfromOrigin = this.transfromOrigin
    const newCenter = matrix.multiply(Point3.origin).add(transfromOrigin.subtract(Point3.origin));

    this.center = newCenter;
    const up = new Vector3(0, 1, 0)
    const rotation = matrix.multiply(up).dot(up)
    this.rotation += rotation
    this.controlPoints = this.calculateControlPoints();
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

  public resize(fixedPoint: Point3, dynamicPoint: Point3, resizeVector: Vector3): void {

    const referenceVector = dynamicPoint.subtract(fixedPoint)
    // TODO: 此时不应该使用viewport作为参考系，而是该采用内容包围盒
    let width = Math.abs(referenceVector.x) || Infinity
    let height = Math.abs(referenceVector.y) || Infinity
    // 变化比例：(dimension + delta) / dimension
    const scaleX = 1 + resizeVector.x * Math.sign(referenceVector.x) / width;
    const scaleY = 1 + resizeVector.y * Math.sign(referenceVector.y) / height;

    this.center = new Point3(this.center.x * scaleX, this.center.y * scaleY, 0)

    this.xRadius = Math.abs(this.xRadius * scaleX)
    this.yRadius = Math.abs(this.yRadius * scaleY)

    // 计算控制点（用于边界框计算）
    this.controlPoints = this.calculateControlPoints();

    this.bounds = this.updateBounds(referenceVector.x - resizeVector.x > 0, referenceVector.y - resizeVector.y > 0)
  }
}

