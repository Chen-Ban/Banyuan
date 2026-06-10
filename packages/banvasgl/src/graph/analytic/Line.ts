import { GraphType } from "@/foundation/constants";
import AnalyticGraph from "./AnalyticGraph";
import { Point3, Vector3, Matrix4, GeometryUtils } from "@/foundation/math";
import { Style } from "@/foundation/style";
import Bounds from "@/graph/base/Bounds";
import Graph from "@/graph/base/Graph";
import { intersect } from "@/graph/algorithm/IntersectionUtils";
import type { ILine } from '@/types/graph/graph'
import type { ISerializable } from '@/types/foundation/serializable'
import { generateId } from "@/foundation/utils";

/**
 * 直线图形
 *
 * 由两个端点（起点和终点）确定的线段，是最基础的解析式图形。
 * 支持参数化取点、切线/法线计算、点到线段投影、序列化/反序列化等完整几何运算。
 * 直线为开放路径，不具有面积。
 *
 * @example
 * ```typescript
 * const line = new Line(
 *   new Point3(0, 0, 0),
 *   new Point3(100, 50, 0),
 * );
 * // 获取中点
 * const mid = line.getPointAt(0.5);
 * // 获取切线方向
 * const tangent = line.getTangentAt(0.5);
 * ```
 */
export default class Line
  extends AnalyticGraph
  implements ILine, ISerializable
{
  /**
   * 图形类型标识，固定为 `GraphType.LINE`
   */
  public type: GraphType = GraphType.LINE;

  /**
   * 控制点数组，`[startPoint, endPoint]`
   *
   * - `controlPoints[0]`：线段起点
   * - `controlPoints[1]`：线段终点
   */
  public controlPoints: Point3[];

  /**
   * 线条的轴对齐包围盒（AABB）
   */
  public bounds: Bounds;

  /**
   * 创建一条直线
   *
   * @param startPoint - {Point3} 线段起点
   * @param endPoint - {Point3} 线段终点
   * @param style - {Style} 线条样式，默认为 `Style.DEFAULT`
   * @param id - {string | undefined} 可选的唯一标识符，未提供时自动生成
   *
   * @example
   * ```typescript
   * const line = new Line(
   *   new Point3(0, 0, 0),
   *   new Point3(200, 100, 0),
   *   new Style({ strokeColor: '#ff0000', lineWidth: 2 }),
   * );
   * ```
   */
  constructor(
    startPoint: Point3,
    endPoint: Point3,
    _style?: Style,
    id?: string,
  ) {
    super(id);
    this.controlPoints = [startPoint, endPoint];

    // 在构造函数中立即计算边界框，确保View能获取到正确的初始尺寸
    this.bounds = this.updateBounds();
    if (!id) this.id = generateId(this.type);
  }

  /**
   * 判断图形是否为闭合路径
   *
   * 直线始终为开放路径，永远返回 `false`。
   *
   * @returns {boolean} 固定返回 `false`
   *
   * @example
   * ```typescript
   * const line = new Line(start, end);
   * console.log(line.isClosed()); // false
   * ```
   */
  public isClosed(): boolean {
    return false;
  }

  /**
   * 获取线段起点
   *
   * @returns {Point3} 线段的起始点，即 `controlPoints[0]`
   *
   * @example
   * ```typescript
   * const line = new Line(new Point3(10, 20, 0), new Point3(100, 200, 0));
   * console.log(line.startPoint); // Point3(10, 20, 0)
   * ```
   */
  get startPoint(): Point3 {
    return this.controlPoints[0];
  }

  /**
   * 获取线段终点
   *
   * @returns {Point3} 线段的终止点，即 `controlPoints[1]`
   *
   * @example
   * ```typescript
   * const line = new Line(new Point3(10, 20, 0), new Point3(100, 200, 0));
   * console.log(line.endPoint); // Point3(100, 200, 0)
   * ```
   */
  get endPoint(): Point3 {
    return this.controlPoints[1];
  }

  /**
   * 设置线段起点
   *
   * 修改起点后自动重新计算包围盒。
   *
   * @param point - {Point3} 新的起始点
   *
   * @example
   * ```typescript
   * line.startPoint = new Point3(50, 50, 0);
   * ```
   */
  set startPoint(point: Point3) {
    this.controlPoints[0] = point;
    this.updateBounds();
  }

  /**
   * 设置线段终点
   *
   * 修改终点后自动重新计算包围盒。
   *
   * @param point - {Point3} 新的终止点
   *
   * @example
   * ```typescript
   * line.endPoint = new Point3(300, 150, 0);
   * ```
   */
  set endPoint(point: Point3) {
    this.controlPoints[1] = point;
    this.updateBounds();
  }

  /**
   * 设置指定索引的控制点
   *
   * 通过索引修改控制点，修改后自动更新包围盒。
   * 索引越界时不执行任何操作。
   *
   * @param index - {number} 控制点索引，`0` 为起点，`1` 为终点
   * @param point - {Point3} 新的控制点位置（内部会复制一份）
   *
   * @example
   * ```typescript
   * line.setControlPoint(0, new Point3(10, 20, 0)); // 设置起点
   * line.setControlPoint(1, new Point3(100, 200, 0)); // 设置终点
   * ```
   */
  public setControlPoint(index: number, point: Point3): void {
    if (index < 0 || index >= this.controlPoints.length) return;
    this.controlPoints[index] = point.copy();
    this.bounds = this.updateBounds();
  }

  /**
   * 计算线条的包围盒
   *
   * 根据当前所有控制点重新计算轴对齐包围盒（AABB）。
   *
   * @returns {Bounds} 由所有控制点确定的最小包围盒
   *
   * @example
   * ```typescript
   * const line = new Line(new Point3(10, 20, 0), new Point3(100, 200, 0));
   * const bounds = line.updateBounds();
   * console.log(bounds.width, bounds.height); // 90, 180
   * ```
   */
  public updateBounds(): Bounds {
    return Bounds.fromPoints(this.controlPoints);
  }

  /**
   * 将线条路径绘制到 Canvas 上下文
   *
   * 仅绘制路径（moveTo + lineTo），不执行描边或填充，
   * 适合用于组合路径或裁剪区域的构建。
   *
   * @param ctx - {CanvasRenderingContext2D} Canvas 2D 渲染上下文
   * @param dependent - {Boolean} 是否由本方法调用 `ctx.beginPath()`；
   *   为 `true` 时先调用 `beginPath()` 再绘制路径，为 `false` 时仅追加路径
   *
   * @example
   * ```typescript
   * line.renderPath(ctx, true); // 开始新路径并绘制线段
   * line.renderPath(ctx, false); // 追加到当前路径
   * ```
   */
  public renderPath(ctx: CanvasRenderingContext2D, dependent: Boolean): void {
    dependent && ctx.beginPath();
    ctx.moveTo(this.startPoint.x, this.startPoint.y);
    ctx.lineTo(this.endPoint.x, this.endPoint.y);
  }

  /**
   * 渲染线条
   *
   * 将线条以当前样式渲染到 Canvas 上下文中，包括保存/恢复上下文状态、
   * 应用样式、绘制路径和描边。
   *
   * @param ctx - {CanvasRenderingContext2D} Canvas 2D 渲染上下文
   *
   * @example
   * ```typescript
   * const line = new Line(start, end, new Style({ strokeColor: '#ff0000' }));
   * line.render(ctx);
   * ```
   */
  public render(ctx: CanvasRenderingContext2D, style: Style): void {
    ctx.save();
    const bounds = this.bounds;
    style.applyToContext(
      ctx,
      Math.abs(bounds.width),
      Math.abs(bounds.height),
    );
    this.renderPath(ctx, true);
    ctx.stroke();
    ctx.restore();
  }

  // ── 序列化 ──

  /**
   * 将线条序列化为 JSON 对象
   *
   * 输出结构包含 `id`、`type`、`controlPoints`（每个点序列化为数组）和 `style`。
   *
   * @returns {{ id: string; type: GraphType; controlPoints: any[]; style: any }} 可 JSON 化的纯对象
   *
   * @example
   * ```typescript
   * const json = line.toJSON();
   * // { id: 'line_xxx', type: 2, controlPoints: [...], style: {...} }
   * ```
   */
  toJSON(): any {
    return {
      id: this.id,
      type: this.type,
      controlPoints: this.controlPoints.map((p) => p.toJSON()),
    };
  }

  /**
   * 从 JSON 对象反序列化创建线条实例
   *
   * @param data - {any} 序列化数据对象，需包含 `controlPoints`、`style` 和可选的 `id`
   * @returns {Line} 还原后的线条实例
   *
   * @example
   * ```typescript
   * const line = Line.fromJSON({
   *   id: 'line_abc',
   *   type: GraphType.LINE,
   *   controlPoints: [{ x: 0, y: 0, z: 0 }, { x: 100, y: 50, z: 0 }],
   *   style: { strokeColor: '#000' },
   * });
   * ```
   */
  static fromJSON(data: any): Line {
    const points = data.controlPoints.map((p: any) => Point3.fromJSON(p));
    const line = new Line(points[0], points[1]);
    line.id = data.id;
    return line;
  }

  /**
   * 复制线条
   *
   * 创建当前线条的深拷贝，包括起点、终点和样式的独立副本。
   *
   * @returns {this} 当前线条的深拷贝实例
   *
   * @example
   * ```typescript
   * const copied = line.copy();
   * copied.startPoint = new Point3(0, 0, 0); // 不影响原线条
   * ```
   */
  public copy(): this {
    return new Line(
      this.startPoint.copy(),
      this.endPoint.copy(),
    ) as this;
  }

  // ========== AnalyticGraph 抽象方法实现 ==========

  /**
   * 获取线条上指定参数 t 处的点
   *
   * 参数 `t` 在 `[0, 1]` 范围内线性插值，`t=0` 返回起点，`t=1` 返回终点。
   * 计算公式：`P(t) = start + t × (end - start)`
   *
   * @param t - {number} 参数值，范围 `[0, 1]`，`0` 为起点，`1` 为终点
   * @returns {Point3} 参数 t 对应的线段上的点
   *
   * @example
   * ```typescript
   * const line = new Line(new Point3(0, 0, 0), new Point3(100, 0, 0));
   * line.getPointAt(0);   // Point3(0, 0, 0)
   * line.getPointAt(0.5); // Point3(50, 0, 0)
   * line.getPointAt(1);   // Point3(100, 0, 0)
   * ```
   */
  public getPointAt(t: number): Point3 {
    const start = this.startPoint;
    const end = this.endPoint;
    return new Point3(
      start.x + t * (end.x - start.x),
      start.y + t * (end.y - start.y),
      start.z + t * (end.z - start.z),
    );
  }

  /**
   * 获取线条上指定参数 t 处的切线向量
   *
   * 直线的切线方向恒定，等于从起点指向终点的向量，与参数 t 无关。
   *
   * @param t - {number} 参数值（直线切线与 t 无关，但保持接口一致性）
   * @returns {Vector3} 切线方向向量（未归一化）
   *
   * @example
   * ```typescript
   * const line = new Line(new Point3(0, 0, 0), new Point3(100, 50, 0));
   * const tangent = line.getTangentAt(0.5);
   * // Vector3(100, 50, 0)
   * ```
   */
  public getTangentAt(t: number): Vector3 {
    const start = this.startPoint;
    const end = this.endPoint;
    return new Vector3(end.x - start.x, end.y - start.y, end.z - start.z);
  }

  /**
   * 获取线条上指定参数 t 处的法向量
   *
   * 法向量是切线向量逆时针旋转 90° 后归一化的结果。
   * 对于水平直线（切线朝右），法向量朝上。
   *
   * @param t - {number} 参数值（直线法线与 t 无关，但保持接口一致性）
   * @returns {Vector3} 归一化的法向量
   *
   * @example
   * ```typescript
   * const line = new Line(new Point3(0, 0, 0), new Point3(100, 0, 0));
   * const normal = line.getNormalAt(0.5);
   * // Vector3(0, 1, 0) — 朝上
   * ```
   */
  public getNormalAt(t: number): Vector3 {
    const tangent = this.getTangentAt(t);
    return new Vector3(-tangent.y, tangent.x, 0).normalized;
  }

  /**
   * 计算点到线段的最短距离，并返回最近点信息
   *
   * 将外部点投影到线段所在的无限直线上，然后限制到 `[0, 1]` 参数范围，
   * 得到线段上距离目标点最近的位置。若线段退化为点（起点等于终点），
   * 直接返回到起点的距离。
   *
   * @param point - {Point3} 目标点
   * @returns {{ distance: number; closestPoint: Point3; parameter: number }}
   *   - `distance`：目标点到最近点的欧氏距离
   *   - `closestPoint`：线段上最近的点
   *   - `parameter`：最近点对应的参数 t，范围 `[0, 1]`
   *
   * @example
   * ```typescript
   * const line = new Line(new Point3(0, 0, 0), new Point3(100, 0, 0));
   * const result = line.getClosestPoint(new Point3(50, 30, 0));
   * // { distance: 30, closestPoint: Point3(50, 0, 0), parameter: 0.5 }
   * ```
   */
  public getClosestPoint(point: Point3): {
    distance: number;
    closestPoint: Point3;
    parameter: number;
  } {
    const t = GeometryUtils.projectT(point, this.startPoint, this.endPoint);
    // 线段退化为点时，直接返回起点
    if (t === null) {
      return {
        distance: point.distance(this.startPoint),
        closestPoint: this.startPoint.copy(),
        parameter: 0,
      };
    }
    // 将 t 限制在 [0, 1] 内，确保最近点在线段上
    const clampedT = Math.max(0, Math.min(1, t));
    const closestPoint = this.getPointAt(clampedT);
    return {
      distance: point.distance(closestPoint),
      closestPoint,
      parameter: clampedT,
    };
  }

  /**
   * 计算线条在指定参数范围内的长度
   *
   * 对于直线，长度即为两端点之间的欧氏距离。
   *
   * @param tStart - {number} 起始参数，范围 `[0, 1]`
   * @param tEnd - {number} 终止参数，范围 `[0, 1]`
   * @returns {number} 指定参数范围内的线段长度
   *
   * @example
   * ```typescript
   * const line = new Line(new Point3(0, 0, 0), new Point3(100, 0, 0));
   * line.getLength(0, 1);   // 100
   * line.getLength(0, 0.5); // 50
   * ```
   */
  public getLength(tStart: number, tEnd: number): number {
    const startPoint = this.getPointAt(tStart);
    const endPoint = this.getPointAt(tEnd);
    return startPoint.distance(endPoint);
  }

  /**
   * 计算线条的面积
   *
   * 直线为开放路径，不具有面积，调用此方法将抛出异常。
   *
   * @returns {never} 永远抛出错误
   * @throws {Error} 始终抛出 "Line 是开放路径，不具有面积"
   *
   * @example
   * ```typescript
   * const line = new Line(start, end);
   * line.getArea(); // 抛出 Error: Line 是开放路径，不具有面积
   * ```
   */
  public getArea(): number {
    throw new Error("Line 是开放路径，不具有面积");
  }

  /**
   * 计算线条的质心
   *
   * 返回起点和终点的几何中点，即 `P = (startPoint + endPoint) / 2`。
   *
   * @returns {Point3} 线段的中点
   *
   * @example
   * ```typescript
   * const line = new Line(new Point3(0, 0, 0), new Point3(100, 50, 0));
   * line.getCentroid(); // Point3(50, 25, 0)
   * ```
   */
  public getCentroid(): Point3 {
    return new Point3(
      (this.startPoint.x + this.endPoint.x) / 2,
      (this.startPoint.y + this.endPoint.y) / 2,
      (this.startPoint.z + this.endPoint.z) / 2,
    );
  }

  /**
   * 应用变换矩阵到线条
   *
   * 将变换矩阵分别作用于起点和终点，然后更新包围盒。
   * 此方法会就地修改线条的控制点。
   *
   * @param matrix - {Matrix4} 4×4 变换矩阵
   * @returns {AnalyticGraph} 返回 `this`，支持链式调用
   *
   * @example
   * ```typescript
   * const matrix = Matrix4.identity().translate(new Vector3(50, 0, 0));
   * line.transform(matrix); // 整条线段向右平移 50
   * ```
   */
  public transform(matrix: Matrix4): AnalyticGraph {
    this.controlPoints[0] = matrix.multiply(this.startPoint);
    this.controlPoints[1] = matrix.multiply(this.endPoint);
    this.bounds = this.updateBounds();
    return this;
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
   * const line1 = new Line(new Point3(0, 0, 0), new Point3(100, 100, 0));
   * const line2 = new Line(new Point3(0, 100, 0), new Point3(100, 0, 0));
   * const intersections = line1.intersect(line2);
   * // [Point3(50, 50, 0)]
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
   * 按比例缩放调整线条尺寸
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
   * line.resize(
   *   new Point3(0, 0, 0),    // 锚点
   *   new Point3(100, 50, 0), // 原始对角点
   *   new Vector3(20, 10, 0), // 宽增20、高增10
   * );
   * ```
   */
  public resize(
    fixedPoint: Point3,
    dynamicPoint: Point3,
    resizeVector: Vector3,
  ): void {
    const referenceVector = dynamicPoint.subtract(fixedPoint);
    const width = Math.abs(referenceVector.x) || Infinity;
    const height = Math.abs(referenceVector.y) || Infinity;

    for (let i = 0; i < this.controlPoints.length; i++) {
      const p = this.controlPoints[i];
      const scaleX = Math.abs(p.x - fixedPoint.x) / width;
      const scaleY = Math.abs(p.y - fixedPoint.y) / height;

      // 带方向并且按照介质尺寸缩放的移动量
      this.controlPoints[i] = new Point3(
        p.x + resizeVector.x * scaleX,
        p.y + resizeVector.y * scaleY,
        p.z
      );
    }

    this.bounds = this.updateBounds();
  }
}
