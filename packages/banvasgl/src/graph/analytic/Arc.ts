import { GRAPHTYPE } from "@/foundation/constants";
import AnalyticGraph from "./AnalyticGraph";
import { Point3, Vector3, Matrix4, MathUtils } from "@/foundation/math";
import { Style } from "@/foundation/style";
import Bounds from "@/graph/base/Bounds";
import Graph from "@/graph/base/Graph";
import { intersect } from "@/graph/algorithm/IntersectionUtils";
import { IArc } from "@/types";
import type { ISerializable } from "@/types";
import { generateId } from "@/foundation/utils";

export default class Arc extends AnalyticGraph implements IArc, ISerializable {
  public type: GRAPHTYPE = GRAPHTYPE.ARC;
  public controlPoints: Point3[];
  public style: Style;
  public bounds: Bounds;

  // 椭圆弧属性
  public center: Point3;
  public xRadius: number; // X轴半径
  public yRadius: number; // Y轴半径
  public rotation: number; // 旋转角度（弧度）
  public startAngle: number; // 起始角度（弧度）
  public endAngle: number; // 结束角度（弧度）
  public clockwise: boolean; // 是否顺时针

  public isClosed(): boolean {
    return Math.abs(this.endAngle - this.startAngle) >= 2 * Math.PI;
  }

  constructor(
    center: Point3,
    xRadius: number,
    yRadius: number,
    rotation: number,
    startAngle: number,
    endAngle: number,
    clockwise: boolean = false,
    style: Style = Style.DEFAULT,
    id?: string,
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

    this.bounds = this.updateBounds();
    if (!id) this.id = generateId(this.type);
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

  /**
   * Arc 的控制点由参数（center/radius/angle）派生，不支持直接编辑
   */
  public setControlPoint(_index: number, _point: Point3): void {
    // no-op：Arc 顶点编辑应通过 setCenter/setXRadius/setYRadius 等参数化接口实现
  }

  // 设置中心点
  setCenter(center: Point3): Arc {
    this.center = center;
    this.controlPoints = this.calculateControlPoints();
    this.bounds = this.updateBounds();
    return this;
  }

  // 设置X轴半径
  setXRadius(xRadius: number): Arc {
    if (xRadius < 0) throw new Error("x半径不能为负数");
    this.xRadius = xRadius;
    this.controlPoints = this.calculateControlPoints();
    this.bounds = this.updateBounds();
    return this;
  }

  // 设置Y轴半径
  setYRadius(yRadius: number): Arc {
    if (yRadius < 0) throw new Error("y半径不能为负数");
    this.yRadius = yRadius;
    this.controlPoints = this.calculateControlPoints();
    this.bounds = this.updateBounds();
    return this;
  }

  // 设置旋转角度
  setRotation(rotation: number): Arc {
    this.rotation = rotation;
    this.controlPoints = this.calculateControlPoints();
    this.bounds = this.updateBounds();
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
      this.clockwise,
    );
  }

  // 渲染圆弧
  public render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    const bounds = this.bounds;
    this.style.applyToContext(
      ctx,
      Math.abs(bounds.width),
      Math.abs(bounds.height),
    );
    this.renderPath(ctx, true);
    ctx.stroke();
    ctx.restore();
  }

  // ── 序列化 ──
  toJSON(): any {
    return {
      id: this.id,
      type: this.type,
      center: this.center.toJSON(),
      xRadius: this.xRadius,
      yRadius: this.yRadius,
      rotation: this.rotation,
      startAngle: this.startAngle,
      endAngle: this.endAngle,
      clockwise: this.clockwise,
      style: this.style.toJSON(),
    };
  }

  static fromJSON(data: any): Arc {
    const arc = new Arc(
      Point3.fromJSON(data.center),
      data.xRadius,
      data.yRadius,
      data.rotation,
      data.startAngle,
      data.endAngle,
      data.clockwise,
      Style.fromJSON(data.style),
    );
    arc.id = data.id;
    return arc;
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
      this.style.copy(),
    ) as this;
  }

  // 计算椭圆弧的包围盒（解析求解极值点）
  public updateBounds(): Bounds {
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    const a = this.xRadius;
    const b = this.yRadius;

    // 旋转椭圆参数方程：
    //   x(θ) = cx + a·cosθ·cosR - b·sinθ·sinR
    //   y(θ) = cy + a·cosθ·sinR + b·sinθ·cosR
    // 令 dx/dθ = 0 → tanθ = -(b·sinR)/(a·cosR) → θ_x = atan2(-b·sin, a·cos)
    // 令 dy/dθ = 0 → tanθ = (b·cosR)/(a·sinR)  → θ_y = atan2(b·cos, a·sin)

    const thetaX = Math.atan2(-b * sin, a * cos);
    const thetaY = Math.atan2(b * cos, a * sin);

    // 极值候选角度：两个 x 极值 + 两个 y 极值
    const candidates: number[] = [
      thetaX, thetaX + Math.PI,
      thetaY, thetaY + Math.PI,
    ];

    // 归一化角度到 [0, 2π)
    const TWO_PI = MathUtils.TWO_PI;
    const normalize = (angle: number): number => ((angle % TWO_PI) + TWO_PI) % TWO_PI;

    const normStart = normalize(this.startAngle);
    const normEnd = normalize(this.endAngle);

    // 计算椭圆上角度 θ 对应的世界坐标点
    const pointAtTheta = (theta: number): Point3 => {
      const ct = Math.cos(theta);
      const st = Math.sin(theta);
      return new Point3(
        this.center.x + a * ct * cos - b * st * sin,
        this.center.y + a * ct * sin + b * st * cos,
        0,
      );
    };

    // 起止点必须包含
    const points: Point3[] = [
      pointAtTheta(this.startAngle),
      pointAtTheta(this.endAngle),
    ];

    // 只添加落在弧范围内的极值点
    for (const theta of candidates) {
      const normTheta = normalize(theta);
      if (MathUtils.isAngleInArcRange(normTheta, normStart, normEnd, this.clockwise)) {
        points.push(pointAtTheta(theta));
      }
    }

    return Bounds.fromPoints(points);
  }

  // ========== 椭圆极坐标计算 ==========

  /**
   * 通过笛卡尔极坐标角 φ 计算椭圆上的点（局部坐标系，未旋转）
   *
   * 椭圆极坐标方程（中心为原点）：
   *   r(φ) = (a · b) / √((b·cosφ)² + (a·sinφ)²)
   *   x = r·cosφ, y = r·sinφ
   */
  private getLocalPointAtAngle(angle: number): Point3 {
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const a = this.xRadius;
    const b = this.yRadius;
    const denom = Math.sqrt((b * cosA) ** 2 + (a * sinA) ** 2);
    if (denom < MathUtils.FLOAT_EPSILON) {
      return new Point3(0, 0, 0);
    }
    const r = (a * b) / denom;
    return new Point3(r * cosA, r * sinA, 0);
  }

  // ========== AnalyticGraph 抽象方法实现 ==========

  public getPointAt(t: number): Point3 {
    const angle = this.startAngle + t * (this.endAngle - this.startAngle);
    const localPoint = this.getLocalPointAtAngle(angle);

    // 应用旋转和平移
    const rotated = Matrix4.identity()
      .rotateZ(this.rotation)
      .multiply(localPoint);
    return rotated.add(
      new Vector3(this.center.x, this.center.y, this.center.z),
    );
  }

  public getTangentAt(t: number): Vector3 {
    // 用微小差分求切线方向
    const dt = MathUtils.DERIVATIVE_STEP;
    const p0 = this.getPointAt(Math.max(0, t - dt));
    const p1 = this.getPointAt(Math.min(1, t + dt));
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;

    // 归一化
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length < MathUtils.FLOAT_EPSILON) {
      return new Vector3(0, 0, 0);
    }
    return new Vector3(dx / length, dy / length, 0);
  }

  public getNormalAt(t: number): Vector3 {
    const tangent = this.getTangentAt(t);
    // 法线垂直于切线（顺时针旋转 90°）
    return new Vector3(tangent.y, -tangent.x, 0);
  }

  public getClosestPoint(point: Point3): {
    distance: number;
    closestPoint: Point3;
    parameter: number;
  } {
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
    // 自适应 Simpson 积分求弧长
    // 被积函数 ds/dt = |dP/dt|，即参数曲线速度向量的模
    const speed = (t: number): number => {
      const dt = MathUtils.DERIVATIVE_STEP * 0.1;
      const t0 = Math.max(tStart, t - dt);
      const t1 = Math.min(tEnd, t + dt);
      const p0 = this.getPointAt(t0);
      const p1 = this.getPointAt(t1);
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      return Math.sqrt(dx * dx + dy * dy) / (t1 - t0);
    };

    // Simpson 公式：∫[a,b] f(x)dx ≈ (b-a)/6 · [f(a) + 4f(m) + f(b)]
    const simpson = (a: number, b: number, fa: number, fm: number, fb: number): number => {
      return ((b - a) / 6) * (fa + 4 * fm + fb);
    };

    // 自适应递归：比较整段 Simpson 与两半段之和，差异超阈值则继续细分
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
      // 达到精度或最大深度则停止
      if (depth <= 0 || Math.abs(refined - whole) <= 15 * eps) {
        return refined + (refined - whole) / 15;
      }
      return (
        adaptiveSimpson(a, m, fa, flm, fm, left, eps / 2, depth - 1) +
        adaptiveSimpson(m, b, fm, frm, fb, right, eps / 2, depth - 1)
      );
    };

    const fa = speed(tStart);
    const fb = speed(tEnd);
    const fm = speed((tStart + tEnd) / 2);
    const whole = simpson(tStart, tEnd, fa, fm, fb);

    return adaptiveSimpson(tStart, tEnd, fa, fm, fb, whole, MathUtils.INTEGRATION_TOLERANCE, 12);
  }

  public getArea(): number {
    if (!this.isClosed()) {
      throw new Error("Arc 未闭合，不具有面积");
    }
    // 完整椭圆面积 = π · a · b
    return Math.PI * this.xRadius * this.yRadius;
  }

  public getCentroid(): Point3 {
    return this.controlPoints[2];
  }

  public transform(matrix: Matrix4): AnalyticGraph {
    this.center = matrix.multiply(this.center);
    this.controlPoints = this.calculateControlPoints();
    this.bounds = this.updateBounds();
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

  public resize(
    fixedPoint: Point3,
    dynamicPoint: Point3,
    resizeVector: Vector3,
  ): void {
    const referenceVector = dynamicPoint.subtract(fixedPoint);
    const width = Math.abs(referenceVector.x) || Infinity;
    const height = Math.abs(referenceVector.y) || Infinity;

    // center 按其到 fixedPoint 的距离比例缩放
    const scaleX = Math.abs(this.center.x - fixedPoint.x) / width;
    const scaleY = Math.abs(this.center.y - fixedPoint.y) / height;

    this.center = new Point3(
      this.center.x + resizeVector.x * scaleX,
      this.center.y + resizeVector.y * scaleY,
      this.center.z,
    );

    // 半径按整体缩放比例调整
    const newWidth = width + resizeVector.x * Math.sign(referenceVector.x);
    const newHeight = height + resizeVector.y * Math.sign(referenceVector.y);
    const ratioX = Math.abs(newWidth / width);
    const ratioY = Math.abs(newHeight / height);

    this.xRadius = Math.max(0, this.xRadius * ratioX);
    this.yRadius = Math.max(0, this.yRadius * ratioY);

    this.controlPoints = this.calculateControlPoints();
    this.bounds = this.updateBounds();
  }
}
