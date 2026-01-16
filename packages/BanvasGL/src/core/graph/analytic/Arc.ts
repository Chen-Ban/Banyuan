import { GRAPHTYPE } from "@/core/constants";
import AnalyticGraph from "./AnalyticGraph";
import { Point3, Vector3, Matrix4 } from "@/core/math";
import { Style } from "@/core/style";
import Bounds from "../base/Bounds";
import Graph from "../base/Graph";
import { intersect } from "./IntersectionUtils";

export default class Arc extends AnalyticGraph {
  public type: GRAPHTYPE = GRAPHTYPE.ARC;
  public controlPoints: Point3[];
  public style: Style;

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
    style: Style = Style.DEFAULT
  ) {
    super();
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

    // 在构造函数中立即计算边界框，确保View能获取到正确的初始尺寸
    this.setBounds(this.calculateBounds());
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
    this.setBounds(this.calculateBounds());
    return this;
  }

  // 设置X轴半径
  setXRadius(xRadius: number): Arc {
    this.xRadius = Math.max(0, xRadius);
    this.controlPoints = this.calculateControlPoints();
    this.setBounds(this.calculateBounds());
    return this;
  }

  // 设置Y轴半径
  setYRadius(yRadius: number): Arc {
    this.yRadius = Math.max(0, yRadius);
    this.controlPoints = this.calculateControlPoints();
    this.setBounds(this.calculateBounds());
    return this;
  }

  // 设置旋转角度
  setRotation(rotation: number): Arc {
    this.rotation = rotation;
    this.controlPoints = this.calculateControlPoints();
    this.setBounds(this.calculateBounds());
    return this;
  }

  // 兼容性方法：设置半径（同时设置xRadius和yRadius）
  setRadius(radius: number): Arc {
    this.xRadius = Math.max(0, radius);
    this.yRadius = Math.max(0, radius);
    this.controlPoints = this.calculateControlPoints();
    this.setBounds(this.calculateBounds());
    return this;
  }

  // 兼容性属性：获取半径（返回平均半径）
  get radius(): number {
    return (this.xRadius + this.yRadius) / 2;
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

  // 获取椭圆弧长度（近似计算）
  get arcLength(): number {
    let angleDiff = Math.abs(this.endAngle - this.startAngle);
    if (this.clockwise) {
      angleDiff = 2 * Math.PI - angleDiff;
    }
    // 使用平均半径进行近似计算
    const avgRadius = (this.xRadius + this.yRadius) / 2;
    return avgRadius * angleDiff;
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
    const bounds = this.getBounds();
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

  // 计算椭圆弧的包围盒：考虑椭圆和旋转
  public calculateBounds(): Bounds {
    // 计算椭圆在旋转后的外接矩形
    // 对于旋转的椭圆，需要计算所有可能的最大最小点
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);

    // 计算椭圆在局部坐标系中的四个关键点（未旋转时）
    const localPoints = [
      { x: this.xRadius, y: 0 },
      { x: -this.xRadius, y: 0 },
      { x: 0, y: this.yRadius },
      { x: 0, y: -this.yRadius },
    ];

    // 旋转这些点并找到边界
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const p of localPoints) {
      const rotatedX = p.x * cos - p.y * sin;
      const rotatedY = p.x * sin + p.y * cos;
      const worldX = this.center.x + rotatedX;
      const worldY = this.center.y + rotatedY;
      minX = Math.min(minX, worldX);
      minY = Math.min(minY, worldY);
      maxX = Math.max(maxX, worldX);
      maxY = Math.max(maxY, worldY);
    }

    // 还需要考虑起始点和结束点
    const startPoint = this.getPointAt(0);
    const endPoint = this.getPointAt(1);
    minX = Math.min(minX, startPoint.x, endPoint.x);
    minY = Math.min(minY, startPoint.y, endPoint.y);
    maxX = Math.max(maxX, startPoint.x, endPoint.x);
    maxY = Math.max(maxY, startPoint.y, endPoint.y);

    return new Bounds(minX, minY, maxX - minX, maxY - minY);
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

    // 应用旋转
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    const rotatedX = localX * cos - localY * sin;
    const rotatedY = localX * sin + localY * cos;

    // 平移到世界坐标系
    return new Point3(this.center.x + rotatedX, this.center.y + rotatedY, this.center.z);
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

  public getIntersections(other: AnalyticGraph): Point3[] {
    // 简化实现，返回空数组
    return [];
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
    const newCenter = matrix.multiply(this.center);

    // 获取变换后的起始点和结束点
    const ts = matrix.multiply(this.getPointAt(0));
    const te = matrix.multiply(this.getPointAt(1));

    // 计算变换后的椭圆参数（简化处理：使用平均半径）
    const startDist = Math.sqrt(Math.pow(ts.x - newCenter.x, 2) + Math.pow(ts.y - newCenter.y, 2));
    const endDist = Math.sqrt(Math.pow(te.x - newCenter.x, 2) + Math.pow(te.y - newCenter.y, 2));
    const avgRadius = (startDist + endDist) / 2;

    // 更新参数（注意：矩阵变换可能改变椭圆的形状，这里使用简化处理）
    this.center = newCenter;
    this.xRadius = avgRadius;
    this.yRadius = avgRadius;
    this.startAngle = Math.atan2(ts.y - newCenter.y, ts.x - newCenter.x);
    this.endAngle = Math.atan2(te.y - newCenter.y, te.x - newCenter.x);
    this.controlPoints = this.calculateControlPoints();
    this.setBounds(this.calculateBounds());
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

  public resize(size: [number, number], diff: [number, number], overflow: [boolean, boolean]): void {
    const [width, height] = size;
    const [dx, dy] = diff;
    const [overflowx, overflowy] = overflow;

    if (overflowx) {
      const restX = Math.abs(dx) - width;
      this.center = new Point3(restX, this.center.y, this.center.z);
      this.xRadius = restX;
    } else {
      this.center.add(new Vector3(dx, 0, 0));
      this.xRadius += dx;
    }

    if (overflowy) {
      const restY = Math.abs(dy) - height;
      this.center = new Point3(this.center.x, restY, this.center.z);
      this.yRadius = restY;
    } else {
      this.center.add(new Vector3(0, dy, 0));
      this.yRadius += dy;
    }

    // 计算控制点（用于边界框计算）
    this.controlPoints = this.calculateControlPoints();

    // 在构造函数中立即计算边界框，确保View能获取到正确的初始尺寸
    this.setBounds(this.calculateBounds());
  }
}

// 类型守卫函数
export function isArc(graph: any): graph is Arc {
  return graph instanceof Arc;
}
