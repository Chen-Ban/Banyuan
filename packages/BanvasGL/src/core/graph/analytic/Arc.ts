import { GRAPHTYPE } from "@/core/constants";
import AnalyticGraph from "./AnalyticGraph";
import { Point3, Vector3, Matrix4 } from "@/core/math";
import { Style } from "@/core/style";
import MathUtils from "@/core/math/MathUtils";
import Bounds from "../base/Bounds";

export default class Arc extends AnalyticGraph {
  public type: GRAPHTYPE = GRAPHTYPE.ARC;
  public controlPoints: Point3[];
  public style: Style;

  // 圆弧属性
  public center: Point3;
  public radius: number;
  public startAngle: number; // 起始角度（弧度）
  public endAngle: number; // 结束角度（弧度）
  public clockwise: boolean; // 是否顺时针

  constructor(
    center: Point3,
    radius: number,
    startAngle: number,
    endAngle: number,
    clockwise: boolean = false,
    style: Style = Style.DEFAULT
  ) {
    super();
    this.center = center;
    this.radius = radius;
    this.startAngle = startAngle;
    this.endAngle = endAngle;
    this.clockwise = clockwise;
    this.style = style;

    // 计算控制点（用于边界框计算）
    this.controlPoints = this.calculateControlPoints();

    // 在构造函数中立即计算边界框，确保View能获取到正确的初始尺寸
    this.setBounds(this.calculateBounds());
  }

  // 计算控制点
  protected calculateControlPoints(): Point3[] {
    const points: Point3[] = [];

    // 添加起始点
    const startX = this.center.x + this.radius * Math.cos(this.startAngle);
    const startY = this.center.y + this.radius * Math.sin(this.startAngle);
    points.push(new Point3(startX, startY, this.center.z));

    // 添加结束点
    const endX = this.center.x + this.radius * Math.cos(this.endAngle);
    const endY = this.center.y + this.radius * Math.sin(this.endAngle);
    points.push(new Point3(endX, endY, this.center.z));

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
    return this;
  }

  // 设置半径
  setRadius(radius: number): Arc {
    this.radius = Math.max(0, radius);
    this.controlPoints = this.calculateControlPoints();
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

  // 获取圆弧长度
  get arcLength(): number {
    let angleDiff = Math.abs(this.endAngle - this.startAngle);
    if (this.clockwise) {
      angleDiff = 2 * Math.PI - angleDiff;
    }
    return this.radius * angleDiff;
  }

  // 获取圆弧角度差
  get angleDifference(): number {
    let diff = this.endAngle - this.startAngle;
    if (this.clockwise) {
      diff = -diff;
    }
    return this.normalizeAngle(diff);
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
    ctx.arc(this.center.x, this.center.y, this.radius, this.startAngle, this.endAngle, this.clockwise);
  }

  // 渲染圆弧
  public render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    const bounds = this.getBounds();
    this.style.applyToContext(ctx, bounds.width, bounds.height);
    this.renderPath(ctx, true);
    ctx.stroke();
    ctx.restore();
  }

  // 复制圆弧
  public copy(): this {
    return new Arc(
      this.center.copy(),
      this.radius,
      this.startAngle,
      this.endAngle,
      this.clockwise,
      this.style.copy()
    ) as this;
  }

  // 计算圆弧的包围盒：使用所属圆的外接矩形
  public calculateBounds(): Bounds {
    const x = this.center.x - this.radius;
    const y = this.center.y - this.radius;
    const size = this.radius * 2;
    return new Bounds(x, y, size, size);
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
    return new Point3(
      this.center.x + this.radius * Math.cos(angle),
      this.center.y + this.radius * Math.sin(angle),
      this.center.z
    );
  }

  public getTangentAt(t: number): Vector3 {
    const angle = this.startAngle + t * (this.endAngle - this.startAngle);
    return new Vector3(-Math.sin(angle), Math.cos(angle), 0);
  }

  public getNormalAt(t: number): Vector3 {
    const angle = this.startAngle + t * (this.endAngle - this.startAngle);
    return new Vector3(Math.cos(angle), Math.sin(angle), 0);
  }

  public getClosestPoint(point: Point3): {
    distance: number;
    closestPoint: Point3;
    parameter: number;
  } {
    const distanceToCenter = MathUtils.distance(point, this.center);
    const angle = Math.atan2(point.y - this.center.y, point.x - this.center.x);

    // 将角度标准化到圆弧范围内
    const normalizedAngle = this.normalizeAngle(angle);
    const t = this.getParameterFromAngle(normalizedAngle);

    const closestPoint = this.getPointAt(t);
    const distance = MathUtils.distance(point, closestPoint);

    return { distance, closestPoint, parameter: t };
  }

  public getIntersections(other: AnalyticGraph): Point3[] {
    // 简化实现，返回空数组
    return [];
  }

  public getLength(tStart: number, tEnd: number): number {
    const angleDiff = Math.abs((tEnd - tStart) * (this.endAngle - this.startAngle));
    return this.radius * angleDiff;
  }

  public getArea(): number {
    const angleDiff = Math.abs(this.endAngle - this.startAngle);
    return 0.5 * this.radius * this.radius * angleDiff;
  }

  public getCentroid(): Point3 {
    return this.controlPoints[2];
  }

  public transform(matrix: Matrix4): AnalyticGraph {
    const newCenter = matrix.multiply(this.center);
    const ts = matrix.multiply(this.getPointAt(0));
    const te = matrix.multiply(this.getPointAt(1));
    const startAngle = Math.atan2(ts.y - newCenter.y, ts.x - newCenter.x);
    const endAngle = Math.atan2(te.y - newCenter.y, te.x - newCenter.x);
    this.center = newCenter;
    this.startAngle = startAngle;
    this.endAngle = endAngle;
    this.controlPoints = this.calculateControlPoints();
    this.setBounds(this.calculateBounds());
    return this;
  }
}

// 类型守卫函数
export function isArc(graph: any): graph is Arc {
  return graph instanceof Arc;
}
