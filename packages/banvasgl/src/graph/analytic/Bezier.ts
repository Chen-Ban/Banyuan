import { GraphType } from "@/foundation/constants";
import AnalyticGraph from "./AnalyticGraph";
import { Matrix4, MathUtils, Point3, Vector3 } from "@/foundation/math";
import { Style } from "@/foundation/style";
import Bounds from "@/graph/base/Bounds";
import Graph from "@/graph/base/Graph";
import { intersect } from "@/graph/algorithm/IntersectionUtils";
import { IBezier } from '@/types';

/**
 * 贝塞尔曲线抽象基类
 *
 * `Bezier` 是二次/三次贝塞尔曲线的公共抽象基类，继承自 `AnalyticGraph`。
 * 贝塞尔曲线由一组控制点定义，通过 De Casteljau 算法进行参数化求值。
 *
 * **子类：**
 * - `QuadraticBezier`：二次贝塞尔曲线（3 个控制点：起点、控制点、终点）
 * - `CubicBezier`：三次贝塞尔曲线（4 个控制点：起点、控制点1、控制点2、终点）
 *
 * **核心算法：**
 * - `updateBounds`：等参数采样法，沿曲线均匀采样若干点后取最小包围盒
 * - `getLength`：自适应 Simpson 积分，递归细分直至达到精度阈值
 * - `isLinear`：检测所有中间控制点是否在首尾连线上（退化检测）
 * - `getArea`：闭合贝塞尔曲线通过 Shoelace 公式（参数化版本）近似面积
 * - `getCentroid`：控制点的算术平均（贝塞尔曲线的参数均匀均值等于控制点均值）
 *
 * @example
 * ```typescript
 * // Bezier 不可直接实例化，需通过子类使用
 * const quadratic = new QuadraticBezier(p0, p1, p2);
 * const cubic = new CubicBezier(p0, p1, p2, p3);
 *
 * quadratic.getBezierType(); // "quadratic"
 * cubic.getBezierType();     // "cubic"
 * ```
 */
export default abstract class Bezier extends AnalyticGraph implements IBezier {
  /**
   * 图形类型标识，固定为 `GraphType.BEZIER`
   */
  public type: GraphType = GraphType.BEZIER;

  /**
   * 控制点数组
   *
   * - 二次贝塞尔：`[startPoint, controlPoint, endPoint]`（3 个点）
   * - 三次贝塞尔：`[startPoint, controlPoint1, controlPoint2, endPoint]`（4 个点）
   */
  public controlPoints: Point3[];

  /**
   * 贝塞尔曲线的轴对齐包围盒（AABB）
   */
  public bounds: Bounds;

  /**
   * 创建一条贝塞尔曲线
   *
   * @param controlPoints - {Point3[]} 控制点数组（二次 3 个，三次 4 个）
   * @param _style - {Style} 已废弃，保留参数以兼容旧调用方
   * @param id - {string | undefined} 可选的唯一标识符
   *
   * @example
   * ```typescript
   * // 由子类调用
   * class QuadraticBezier extends Bezier {
   *   constructor(start, control, end) {
   *     super([start, control, end]);
   *   }
   * }
   * ```
   */
  constructor(controlPoints: Point3[], _style?: Style, id?: string) {
    super(id);
    this.controlPoints = controlPoints;
    this.bounds = this.updateBounds()
  }

  /**
   * 判断贝塞尔曲线是否为闭合路径
   *
   * 当起点与终点的距离小于 `MathUtils.EPSILON` 时，视为闭合。
   *
   * @returns {boolean} 曲线是否闭合
   *
   * @example
   * ```typescript
   * const open = new QuadraticBezier(p0, p1, p2);
   * open.isClosed(); // 通常为 false
   *
   * // 起终点重合时闭合
   * const closed = new QuadraticBezier(p0, p1, p0);
   * closed.isClosed(); // true
   * ```
   */
  public isClosed(): boolean {
    if (this.controlPoints.length < 2) return false;
    const first = this.controlPoints[0];
    const last = this.controlPoints[this.controlPoints.length - 1];
    return first.distance(last) < MathUtils.EPSILON;
  }

  /**
   * 计算贝塞尔曲线的包围盒（等参数采样法）
   *
   * 沿曲线均匀采样 `getTotalLength()` 个点（取整），
   * 再加上终点，最终由所有采样点确定最小包围盒。
   *
   * 注意：等参数采样在曲率较大的区域可能精度不足，
   * 但对于大多数应用场景已足够。采样密度取决于曲线长度。
   *
   * @returns {Bounds} 贝塞尔曲线的轴对齐包围盒
   *
   * @example
   * ```typescript
   * const bezier = new QuadraticBezier(p0, p1, p2);
   * const bounds = bezier.updateBounds();
   * ```
   */
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

  /**
   * 获取贝塞尔曲线的起始点
   *
   * @returns {Point3} 起始点，即 `controlPoints[0]`
   *
   * @example
   * ```typescript
   * const bezier = new QuadraticBezier(p0, p1, p2);
   * console.log(bezier.startPoint); // p0
   * ```
   */
  get startPoint(): Point3 {
    return this.controlPoints[0];
  }

  /**
   * 获取贝塞尔曲线的终止点
   *
   * @returns {Point3} 终止点，即 `controlPoints[length - 1]`
   *
   * @example
   * ```typescript
   * const bezier = new QuadraticBezier(p0, p1, p2);
   * console.log(bezier.endPoint); // p2
   * ```
   */
  get endPoint(): Point3 {
    return this.controlPoints[this.controlPoints.length - 1];
  }

  /**
   * 批量设置控制点
   *
   * 替换全部控制点并自动重新计算包围盒。
   *
   * @param controlPoints - {Point3[]} 新的控制点数组
   * @returns {Bezier} 返回 `this`，支持链式调用
   *
   * @example
   * ```typescript
   * bezier.setControlPoints([newP0, newP1, newP2]);
   * ```
   */
  setControlPoints(controlPoints: Point3[]): Bezier {
    this.controlPoints = controlPoints;
    this.bounds = this.updateBounds()
    return this;
  }

  /**
   * 设置指定索引的单个控制点
   *
   * 修改后自动重新计算包围盒。索引越界时不执行任何操作。
   *
   * @param index - {number} 控制点索引
   * @param point - {Point3} 新的控制点位置（内部会复制一份）
   *
   * @example
   * ```typescript
   * bezier.setControlPoint(1, new Point3(50, 50, 0)); // 修改控制点1
   * ```
   */
  public setControlPoint(index: number, point: Point3): void {
    if (index < 0 || index >= this.controlPoints.length) return
    this.controlPoints[index] = point.copy()
    this.bounds = this.updateBounds()
  }

  /**
   * 获取指定位置的控制点
   *
   * @param index - {number} 控制点索引
   * @returns {Point3 | null} 控制点副本，索引越界时返回 `null`
   *
   * @example
   * ```typescript
   * const cp = bezier.getControlPoint(1);
   * if (cp) {
   *   console.log(cp.x, cp.y);
   * }
   * ```
   */
  getControlPoint(index: number): Point3 | null {
    if (index < 0 || index >= this.controlPoints.length) {
      return null;
    }
    return this.controlPoints[index];
  }

  /**
   * 计算贝塞尔曲线在指定参数范围内的弧长（自适应 Simpson 积分）
   *
   * 被积函数为参数曲线速度向量的模 `ds/dt = |dP/dt|`。
   * 递归细分直至达到精度阈值或最大递归深度（12 层）。
   *
   * 子类可重写此方法以提供 O(1) 精确版本（如 `Circle`）。
   *
   * @param tStart - {number} 起始参数，范围 `[0, 1]`
   * @param tEnd - {number} 终止参数，范围 `[0, 1]`
   * @returns {number} 指定参数范围内的弧长
   *
   * @example
   * ```typescript
   * const bezier = new QuadraticBezier(p0, p1, p2);
   * bezier.getLength(0, 1);   // 完整弧长
   * bezier.getLength(0, 0.5); // 前半段弧长
   * ```
   */
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

  /**
   * 获取贝塞尔曲线上指定参数 t 处的法向量
   *
   * 法向量是切线向量逆时针旋转 90° 后的结果。
   *
   * @param t - {number} 参数值，范围 `[0, 1]`
   * @returns {Vector3} 法向量（切线逆时针旋转 90°）
   *
   * @example
   * ```typescript
   * const normal = bezier.getNormalAt(0.5);
   * ```
   */
  public getNormalAt(t: number): Vector3 {
    const tangent = this.getTangentAt(t);
    return new Vector3(-tangent.y, tangent.x, 0);
  }

  /**
   * 计算贝塞尔曲线的面积（Shoelace 公式近似）
   *
   * 仅对闭合贝塞尔曲线有效。使用参数化版本的 Shoelace 公式：
   * 将曲线均匀分为 200 段，对每段端点对应用 Shoelace 公式近似积分。
   * 非闭合曲线调用此方法将抛出异常。
   *
   * @returns {number} 闭合曲线围成的面积
   * @throws {Error} 当曲线为开放路径时抛出 "Bezier 是开放路径，不具有面积"
   *
   * @example
   * ```typescript
   * // 闭合贝塞尔曲线（起终点重合）
   * const closed = new QuadraticBezier(p0, p1, p0);
   * closed.getArea(); // Shoelace 近似面积
   *
   * // 开放贝塞尔曲线
   * const open = new QuadraticBezier(p0, p1, p2);
   * open.getArea(); // 抛出 Error
   * ```
   */
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

  /**
   * 检测贝塞尔曲线是否退化为直线
   *
   * 当所有中间控制点都在首尾连线上时（叉积为 0），
   * 贝塞尔曲线退化为直线段。
   *
   * @returns {boolean} 是否退化为直线
   *
   * @example
   * ```typescript
   * // 中间控制点在首尾连线上
   * const degenerate = new QuadraticBezier(
   *   new Point3(0, 0, 0),
   *   new Point3(50, 0, 0),  // 在连线上
   *   new Point3(100, 0, 0),
   * );
   * degenerate.isLinear(); // true
   *
   * // 中间控制点偏离连线
   * const curved = new QuadraticBezier(
   *   new Point3(0, 0, 0),
   *   new Point3(50, 50, 0),  // 偏离连线
   *   new Point3(100, 0, 0),
   * );
   * curved.isLinear(); // false
   * ```
   */
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

  /**
   * 计算点到贝塞尔曲线的最短距离，并返回最近点信息
   *
   * 使用均匀采样法：在曲线上采样 100 个点，找到距离目标点最近的采样点。
   * 适用于精度要求一般的场景。
   *
   * @param point - {Point3} 目标点
   * @returns {{ distance: number; closestPoint: Point3; parameter: number }}
   *   - `distance`：目标点到最近点的欧氏距离
   *   - `closestPoint`：曲线上最近的点
   *   - `parameter`：最近点对应的参数 t，范围 `[0, 1]`
   *
   * @example
   * ```typescript
   * const bezier = new QuadraticBezier(p0, p1, p2);
   * const result = bezier.getClosestPoint(new Point3(50, 50, 0));
   * console.log(result.distance, result.parameter);
   * ```
   */
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

  /**
   * 将贝塞尔曲线路径绘制到 Canvas 上下文
   *
   * 根据 `controlPoints.length` 自动选择 Canvas API：
   * - 3 个控制点：使用 `ctx.quadraticCurveTo()`（二次贝塞尔）
   * - 4 个控制点：使用 `ctx.bezierCurveTo()`（三次贝塞尔）
   *
   * @param ctx - {CanvasRenderingContext2D} Canvas 2D 渲染上下文
   * @param dependent - {Boolean} 是否由本方法调用 `ctx.beginPath()`；
   *   为 `true` 时先调用 `beginPath()` 再绘制路径，为 `false` 时仅追加路径
   *
   * @example
   * ```typescript
   * bezier.renderPath(ctx, true);  // 开始新路径并绘制贝塞尔曲线
   * bezier.renderPath(ctx, false); // 追加到当前路径
   * ```
   */
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

  /**
   * 渲染贝塞尔曲线
   *
   * 将贝塞尔曲线以当前样式渲染到 Canvas 上下文中，包括保存/恢复上下文状态、
   * 应用样式、绘制路径和描边。
   *
   * @param ctx - {CanvasRenderingContext2D} Canvas 2D 渲染上下文
   *
   * @example
   * ```typescript
   * const bezier = new QuadraticBezier(p0, p1, p2, new Style({ strokeColor: '#ff0000' }));
   * bezier.render(ctx);
   * ```
   */
  public render(ctx: CanvasRenderingContext2D, style: Style): void {
    ctx.save();
    const bounds = this.bounds;
    style.applyToContext(ctx, Math.abs(bounds.width), Math.abs(bounds.height));
    this.renderPath(ctx, true);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * 获取贝塞尔曲线的类型
   *
   * 根据控制点数量判断曲线类型：
   * - 3 个控制点 → `"quadratic"`（二次贝塞尔）
   * - 4 个控制点 → `"cubic"`（三次贝塞尔）
   * - 其他 → `"unknown"`
   *
   * @returns {string} 曲线类型字符串
   *
   * @example
   * ```typescript
   * const quad = new QuadraticBezier(p0, p1, p2);
   * quad.getBezierType(); // "quadratic"
   *
   * const cubic = new CubicBezier(p0, p1, p2, p3);
   * cubic.getBezierType(); // "cubic"
   * ```
   */
  public getBezierType(): string {
    return this.controlPoints.length === 3 ? "quadratic" : this.controlPoints.length === 4 ? "cubic" : "unknown";
  }

  /**
   * 计算贝塞尔曲线的质心（控制点的算术平均）
   *
   * 对于贝塞尔曲线，参数 t ∈ [0,1] 的均匀平均等于控制点的算术平均，
   * 因此质心即为所有控制点坐标的算术平均值。
   *
   * @returns {Point3} 质心坐标
   *
   * @example
   * ```typescript
   * const bezier = new QuadraticBezier(
   *   new Point3(0, 0, 0),
   *   new Point3(50, 100, 0),
   *   new Point3(100, 0, 0),
   * );
   * bezier.getCentroid(); // Point3(50, 33.33, 0)
   * ```
   */
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
   *
   * 如果另一个图形也是 `AnalyticGraph`，则使用精确的解析求交算法；
   * 否则委托给对方图形的 `intersect` 方法处理。
   *
   * @param other - {Graph} 另一个图形
   * @returns {Point3[]} 相交点数组，无交点时返回空数组
   *
   * @example
   * ```typescript
   * const bezier = new QuadraticBezier(p0, p1, p2);
   * const line = new Line(start, end);
   * const intersections = bezier.intersect(line);
   * ```
   */
  public intersect(other: Graph): Point3[] {
    // 如果另一个图形也是可分析图形，使用精确的相交计算方法
    if (other instanceof AnalyticGraph) {
      return intersect(this, other);
    }
    // 对于其他类型的图形，使用其他图形的相交计算方法
    return other.intersect(this);
  }

  /**
   * 应用变换矩阵到贝塞尔曲线
   *
   * 将变换矩阵分别作用于每个控制点，然后重新计算包围盒。
   * 此方法会就地修改曲线的控制点。
   *
   * @param matrix - {Matrix4} 4×4 变换矩阵
   * @returns {Graph} 返回变换后的图形
   *
   * @example
   * ```typescript
   * const matrix = Matrix4.identity().translate(new Vector3(50, 0, 0));
   * bezier.transform(matrix); // 曲线整体向右平移 50
   * ```
   */
  public transform(matrix: Matrix4): Graph {
    for (const [i] of this.controlPoints.entries()) {
      this.controlPoints[i] = matrix.multiply(this.controlPoints[i]);
    }
    this.bounds = this.updateBounds()
    return this;
  }

  /**
   * 按比例缩放调整贝塞尔曲线尺寸
   *
   * 以 `fixedPoint` 为锚点，根据 `dynamicPoint` 与 `fixedPoint` 构成的参考尺寸
   * 和 `resizeVector` 指定的增量，对每个控制点按距离比例进行缩放位移。
   *
   * @param fixedPoint - {Point3} 缩放锚点（固定不动的参考点）
   * @param dynamicPoint - {Point3} 动态参考点（与锚点共同确定原始尺寸）
   * @param resizeVector - {Vector3} 缩放增量向量（宽高方向的变化量）
   *
   * @example
   * ```typescript
   * bezier.resize(
   *   new Point3(0, 0, 0),    // 锚点
   *   new Point3(100, 50, 0), // 原始对角点
   *   new Vector3(20, 10, 0), // 宽增20、高增10
   * );
   * ```
   */
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
