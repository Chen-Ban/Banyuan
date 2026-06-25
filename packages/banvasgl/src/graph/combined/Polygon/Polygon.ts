import { GraphType } from "@/foundation/constants";
import Style from "@/foundation/style/Style";
import { Point3, Vector3, Matrix4 } from "@/foundation/math";
import CombinedGraph from "@/graph/combined/CombinedGraph";
import Line from "@/graph/analytic/Line";
import { isGraphType } from '@/foundation/guards'
import type { IPolygon } from '@/types/graph/graph'
import type { ISerializable } from '@/types/foundation/serializable'
import type { IDrawingContext } from '@/types/platform/context.js'
import { generateId } from '@/foundation/utils';

/**
 * 多边形图形基类 —— 基于顶点序列构建的闭合/开放多边形。
 *
 * Polygon 继承自 {@link CombinedGraph}，实现了 {@link IPolygon} 和 {@link ISerializable} 接口，
 * 是 Rectangle、Quadrilateral、Triangle、RegularPolygon 等具体多边形类型的父类。
 *
 * **架构位置**：位于 `graph/combined/Polygon` 层，介于 CombinedGraph 和具体多边形子类之间。
 * Polygon 将顶点（controlPoints）转化为 Line 子图形数组，由 CombinedGraph 统一管理。
 *
 * **核心职责**：
 * - 维护 `controlPoints` 顶点数组，通过 `rebuildEdges` 重建 Line 子图形
 * - 实现鞋带公式（Shoelace formula）计算面积 `getArea`
 * - 实现射线法（Ray casting）判断点包含关系 `containsPoint`
 * - 支持闭合/开放多边形（通过 `closed` 属性控制）
 * - 覆盖 `syncControlPoints` 实现去重聚合（相邻 Line 共享端点）
 *
 * **与 CombinedGraph 的差异**：
 * - CombinedGraph 直接管理任意子图形，Polygon 专管由顶点连成的线段
 * - Polygon 的 `controlPoints` 是语义上的「顶点」，而 CombinedGraph 的 `controlPoints` 是聚合的控制点
 * - Polygon 的 `syncControlPoints` 会去重首尾相接的共享点
 *
 * @example
 * ```ts
 * // 创建闭合三角形
 * const triangle = new Polygon([p1, p2, p3], style, true);
 * // 创建开放折线
 * const polyline = new Polygon([p1, p2, p3], style, false);
 * ```
 */
export default class Polygon extends CombinedGraph implements IPolygon, ISerializable {
  /** 图形类型标识 */
  public type: GraphType = GraphType.POLYGON;

  /** 是否为闭合多边形，`true` 时首尾顶点自动连线 */
  public closed: boolean = true;

  /**
   * 判断多边形是否闭合。
   *
   * @returns {boolean} 是否闭合
   *
   * @example
   * ```ts
   * const poly = new Polygon([p1, p2, p3], style, true);
   * poly.isClosed(); // true
   * ```
   */
  public override isClosed(): boolean {
    return this.closed;
  }

  /**
   * 创建一个多边形实例。
   *
   * 根据传入顶点构建 Line 子图形：闭合多边形首尾相连，开放多边形不连最后一条边。
   * 控制点直接使用传入的顶点（拷贝），而非从子图形聚合。
   *
   * @param {Point3[]} [points=[]] - 顶点数组，至少 2 个点才能生成边
   * @param {Style} [style] - 图形样式
   * @param {boolean} [closed=true] - 是否闭合，`true` 时首尾自动连线
   *
   * @example
   * ```ts
   * const p1 = new Point3(0, 0, 0);
   * const p2 = new Point3(100, 0, 0);
   * const p3 = new Point3(50, 80, 0);
   * const triangle = new Polygon([p1, p2, p3], style, true);
   * ```
   */
  constructor(points: Point3[] = [], _style?: Style, closed: boolean = true) {
    // 先根据传入顶点临时构建线段，避免初始bounds为空
    const vs = points.map((v) => v.copy());
    const lines: Line[] = [];
    if (vs.length >= 2) {
      for (let i = 0; i < vs.length; i++) {
        const current = vs[i];
        const next = vs[(i + 1) % vs.length];
        if (!closed && i === vs.length - 1) break;
        lines.push(new Line(current, next));
      }
    }
    super(lines);
    this.controlPoints = vs;
    this.closed = closed;
    this.id = generateId(this.type)
  }

  /**
   * 从当前控制点（顶点）重建 Line 子图形数组。
   *
   * 清空 `graphs` 后，根据 `controlPoints` 和 `closed` 属性重新生成所有边线，
   * 并更新包围盒。子类在修改控制点后应调用此方法。
   *
   * @example
   * ```ts
   * this.controlPoints[0] = newPoint;
   * this.rebuildEdges();
   * ```
   */
  protected rebuildEdges(): void {
    // 快照顶点：addGraph 内部的 syncControlPoints 会覆写 this.controlPoints，
    // 必须在循环前保存副本，否则循环边界和索引会被中途破坏（只生成 2 条边的 bug 根因）
    const vertices = this.controlPoints.slice();
    this.graphs = [];
    if (vertices.length < 2) {
      return;
    }
    // 直接 push 到 this.graphs，跳过 addGraph 的中间 syncControlPoints 触发
    for (let i = 0; i < vertices.length; i++) {
      // 如果不是闭合多边形且是最后一条边，跳过
      if (!this.closed && i === vertices.length - 1) {
        break;
      }
      const current = vertices[i];
      const next = vertices[(i + 1) % vertices.length];
      this.graphs.push(new Line(current, next));
    }
    // 边重建完毕后统一同步控制点和包围盒
    this.syncControlPoints();
    this.bounds = this.updateBounds();
  }

  /**
   * 应用变换矩阵到多边形。
   *
   * 委托给父类对所有子图形执行变换，然后重新同步控制点。
   *
   * @param {Matrix4} matrix - 4×4 变换矩阵
   * @returns 变换后的多边形（当前实例）
   *
   * @example
   * ```ts
   * const matrix = Matrix4.translation(10, 20, 0);
   * polygon.transform(matrix);
   * ```
   */
  public override transform(matrix: Matrix4): this {
    super.transform(matrix);
    this.syncControlPoints();
    return this;
  }

  /**
   * 从子图形聚合控制点并过滤重复点（首尾相接的共享点）。
   *
   * 遍历所有子图形的控制点，若某个点已存在（`isSame` 判断）则跳过，
   * 避免相邻 Line 共享端点导致控制点重复。
   *
   * @example
   * ```ts
   * polygon.syncControlPoints();
   * console.log(polygon.controlPoints.length); // 顶点数（去重后）
   * ```
   */
  public override syncControlPoints(): void {
    const points: Point3[] = [];
    for (const graph of this.graphs) {
      for (const p of graph.controlPoints as Point3[]) {
        if (!points.some(existing => existing.isSame(p))) {
          points.push(p);
        }
      }
    }
    this.controlPoints = points;
  }


  /**
   * 获取多边形的几何中心（顶点坐标的算术平均值）。
   *
   * 注意：这不是质心（重心），而是顶点坐标的平均值。
   * 对于凸多边形两者接近，但对于凹多边形可能有较大差异。
   *
   * @returns {Point3} 几何中心坐标
   *
   * @example
   * ```ts
   * const center = polygon.getPolygonCenter();
   * ```
   */
  public getPolygonCenter(): Point3 {
    if (this.controlPoints.length === 0) {
      return new Point3(0, 0, 0);
    }

    const sumX = this.controlPoints.reduce((sum, vertex) => sum + vertex.x, 0);
    const sumY = this.controlPoints.reduce((sum, vertex) => sum + vertex.y, 0);
    const sumZ = this.controlPoints.reduce((sum, vertex) => sum + vertex.z, 0);

    return new Point3(sumX / this.controlPoints.length, sumY / this.controlPoints.length, sumZ / this.controlPoints.length);
  }

  /**
   * 计算多边形面积（使用鞋带公式 / Shoelace formula）。
   *
   * 鞋带公式通过对相邻顶点叉积求和再取绝对值的一半来计算面积，
   * 适用于任意简单多边形（凸或凹），要求多边形闭合。
   *
   * 公式：\( A = \frac{1}{2} \left| \sum_{i=0}^{n-1} (x_i y_{i+1} - x_{i+1} y_i) \right| \)
   *
   * @returns {number} 面积值（始终为非负数）
   * @throws {Error} 多边形未闭合时抛出错误
   * @throws {Error} 顶点不足 3 个时抛出错误
   *
   * @example
   * ```ts
   * const area = polygon.getArea();
   * console.log('面积:', area);
   * ```
   */
  public getArea(): number {
    if (!this.isClosed()) {
      throw new Error('Polygon 未闭合，不具有面积');
    }
    if (this.controlPoints.length < 3) {
      throw new Error('Polygon 顶点不足 3 个，无法计算面积');
    }

    let area = 0;
    for (let i = 0; i < this.controlPoints.length; i++) {
      const current = this.controlPoints[i];
      const next = this.controlPoints[(i + 1) % this.controlPoints.length];
      area += current.x * next.y - next.x * current.y;
    }
    return Math.abs(area) / 2;
  }

  /**
   * 计算多边形周长。
   *
   * 对所有边（或开放多边形的所有边）的长度求和。
   *
   * @returns {number} 周长值
   *
   * @example
   * ```ts
   * const perimeter = polygon.getPerimeter();
   * ```
   */
  public getPerimeter(): number {
    if (this.controlPoints.length < 2) {
      return 0;
    }

    const edgeCount = this.closed ? this.controlPoints.length : this.controlPoints.length - 1;
    let perimeter = 0;
    for (let i = 0; i < edgeCount; i++) {
      const current = this.controlPoints[i];
      const next = this.controlPoints[(i + 1) % this.controlPoints.length];
      const dx = next.x - current.x;
      const dy = next.y - current.y;
      perimeter += Math.sqrt(dx * dx + dy * dy);
    }
    return perimeter;
  }

  /**
   * 获取多边形上距离给定点最近的点及参数信息。
   * 遍历所有边线，找到全局最近点。
   *
   * @param {Point3} point - 目标点
   * @returns {{ distance: number; closestPoint: Point3; parameter: number }} 包含距离、最近点和参数 `t`
   *
   * @example
   * ```ts
   * const result = polygon.getClosestPoint(new Point3(10, 20, 0));
   * console.log(result.distance, result.closestPoint);
   * ```
   */
  public getClosestPoint(point: Point3): {
    distance: number;
    closestPoint: Point3;
    parameter: number;
  } {
    const closets = this.graphs.map((line) => line.getClosestPoint(point));
    const minDistance = Math.min(...closets.map((item) => item.distance));
    return closets.find((item) => item.distance === minDistance)!;
  }

  /**
   * 检查点是否在多边形内部（射线法 / Ray casting algorithm）。
   *
   * 从目标点向右发射水平射线，统计与多边形边的交叉次数：
   * 奇数次 → 在内部，偶数次 → 在外部。
   * 适用于任意简单多边形（凸或凹）。
   *
   * @param {Point3} point - 待检测的点
   * @returns {boolean} 是否在多边形内部
   *
   * @example
   * ```ts
   * const inside = polygon.containsPoint(new Point3(50, 50, 0));
   * ```
   */
  public containsPoint(point: Point3): boolean {
    if (this.controlPoints.length < 3) {
      return false;
    }

    let inside = false;
    for (let i = 0, j = this.controlPoints.length - 1; i < this.controlPoints.length; j = i++) {
      const vi = this.controlPoints[i];
      const vj = this.controlPoints[j];

      if (vi.y > point.y !== vj.y > point.y && point.x < ((vj.x - vi.x) * (point.y - vi.y)) / (vj.y - vi.y) + vi.x) {
        inside = !inside;
      }
    }
    return inside;
  }

  /**
   * 获取指定索引的顶点（带边界检查）。
   *
   * @param {number} index - 顶点索引
   * @returns {Point3} 顶点坐标的拷贝
   * @throws {Error} 索引越界时抛出错误
   *
   * @example
   * ```ts
   * const firstVertex = polygon.getVertex(0);
   * const secondVertex = polygon.getVertex(1);
   * ```
   */
  public getVertex(index: number): Point3 {
    if (index < 0 || index >= this.controlPoints.length) {
      throw new Error(`顶点索引越界：${index}，共 ${this.controlPoints.length} 个顶点`)
    }
    return this.controlPoints[index].copy()
  }

  /**
   * 设置指定索引的控制点（顶点），直接修改 controlPoints 并重建多边形。
   *
   * 与 CombinedGraph 的委托模式不同，Polygon 直接修改顶点后重建所有边线。
   *
   * @param {number} index - 控制点索引
   * @param {Point3} point - 新的顶点坐标
   *
   * @example
   * ```ts
   * polygon.setControlPoint(0, new Point3(10, 20, 0));
   * ```
   */
  public override setControlPoint(index: number, point: Point3): void {
    if (index < 0 || index >= this.controlPoints.length) return
    this.controlPoints[index] = point.copy()
    this.rebuildEdges()
  }

  /**
   * 渲染多边形。
   *
   * 直接使用 Canvas API（moveTo + lineTo）绘制，比逐段子图形渲染更高效。
   * 闭合多边形自动执行 `closePath()`。
   *
   * @param {IDrawingContext} ctx - Canvas 2D 渲染上下文
   *
   * @example
   * ```ts
   * polygon.render(ctx);
   * ```
   */
  public render(ctx: IDrawingContext, style: Style): void {
    if (this.controlPoints.length < 2) {
      return;
    }
    const bounds = this.bounds;

    style.applyToContext(ctx, Math.abs(bounds.width), Math.abs(bounds.height));

    ctx.beginPath();
    ctx.moveTo(this.controlPoints[0].x, this.controlPoints[0].y);

    for (let i = 1; i < this.controlPoints.length; i++) {
      ctx.lineTo(this.controlPoints[i].x, this.controlPoints[i].y);
    }

    if (this.closed) {
      ctx.closePath();
    }

    ctx.fill();
    ctx.stroke();
  }

  /**
   * 整体缩放多边形。
   *
   * 将缩放操作委托给每个子 Line 图形，然后同步控制点和更新包围盒。
   * 要求所有子图形必须是 Line 类型。
   *
   * @param {Point3} fixedPoint - 固定点（缩放锚点）
   * @param {Point3} dynamicPoint - 动态点（缩放参考点）
   * @param {Vector3} resizeVector - 缩放向量
   * @throws {Error} 当子图形包含非 Line 类型时抛出错误
   *
   * @example
   * ```ts
   * polygon.resize(anchor, handle, dragVector);
   * ```
   */
  public resize(fixedPoint: Point3, dynamicPoint: Point3, resizeVector: Vector3): void {
    const graphs = this.graphs
    if (!graphs.every(graph => isGraphType(graph, GraphType.LINE))) throw new Error("多边形边只能为Line")
    for (const graph of graphs) {
      graph.resize(fixedPoint, dynamicPoint, resizeVector)
    }
    this.syncControlPoints()
    this.bounds = this.updateBounds()
  }

  // ── 序列化 ──

  /**
   * 将多边形序列化为 JSON 对象。
   *
   * @returns {any} 包含 id、type、controlPoints、closed、style 的 JSON 对象
   *
   * @example
   * ```ts
   * const json = polygon.toJSON();
   * // json = { id: '...', type: GraphType.POLYGON, controlPoints: [...], closed: true, style: {...} }
   * ```
   */
  public toJSON(): any {
    return {
      id: this.id,
      type: this.type,
      controlPoints: this.controlPoints.map(v => v.toJSON()),
      closed: this.closed,
    }
  }

  /**
   * 从 JSON 数据重建 Polygon 实例。
   *
   * @param {any} data - 序列化数据，需包含 controlPoints、closed（或 isClosed）、style
   * @returns {Polygon} 重建的多边形实例
   *
   * @example
   * ```ts
   * const poly = Polygon.fromJSON({
   *   id: '...',
   *   type: GraphType.POLYGON,
   *   controlPoints: [{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }, { x: 50, y: 80, z: 0 }],
   *   closed: true,
   *   style: {...}
   * });
   * ```
   */
  public static fromJSON(data: any): Polygon {
    const points = data.controlPoints.map((v: any) => Point3.fromJSON(v))
    const polygon = new Polygon(points, undefined, data.closed ?? data.isClosed)
    polygon.id = data.id
    return polygon
  }

  /**
   * 复制多边形，返回一个深拷贝的新实例。
   *
   * @returns {this} 复制后的多边形实例
   *
   * @example
   * ```ts
   * const copy = polygon.copy();
   * ```
   */
  public copy(): this {
    return new Polygon(this.controlPoints, undefined, this.closed) as this;
  }
}
