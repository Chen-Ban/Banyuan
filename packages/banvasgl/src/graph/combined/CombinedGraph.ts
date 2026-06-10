import { GraphType } from "@/foundation/constants";
import Style from "@/foundation/style/Style";
import {
  MathUtils,
  Point3,
  Vector3,
  Matrix4,
  GeometryUtils,
} from "@/foundation/math";
import Graph from "@/graph/base/Graph";
import Bounds from "@/graph/base/Bounds";
import type { ICombinedGraph } from '@/types/graph/graph'
import type { ISerializable } from '@/types/foundation/serializable'
import { generateId } from "@/foundation/utils";

/**
 * 组合图形基类 —— 将多个子图形聚合为一个整体进行管理、渲染和交互。
 *
 * CombinedGraph 是 BanvasGL 图形体系中「组合图形」的核心基类，
 * 继承自 {@link Graph}，实现了 {@link ICombinedGraph} 和 {@link ISerializable} 接口。
 *
 * **架构位置**：位于 `graph/combined` 层，是 Polygon、RoundedRect 等具体组合图形的父类。
 * 所有由多段子图形（Line、Arc、Bezier 等）拼接而成的图形都应继承此类。
 *
 * **核心职责**：
 * - 维护 `graphs` 子图形数组，统一生命周期管理
 * - 聚合控制点 `controlPoints`，支持从子图形同步和按索引委托设置
 * - 统一遍历子图形实现 `getLength`、`getPointAt`、`getTangentAt`、`getNormalAt` 等参数化方法
 * - 通过 `getTAtInnerGraph` 将全局参数 `t` 映射到子图形的局部参数
 * - 统一包围盒计算（`updateBounds`）和渲染（`render`/`renderPath`）
 *
 * **使用场景**：当需要创建由多段曲线/直线组成的复合图形时，
 * 应继承 CombinedGraph 并在子类中实现具体的 `rebuildEdges` 和 `syncControlPoints` 逻辑。
 *
 * @example
 * ```ts
 * const line = new Line(p1, p2, style);
 * const arc = new Arc(center, rx, ry, rotation, startAngle, endAngle, false, style);
 * const combined = new CombinedGraph([line, arc], style);
 * ```
 */
export default class CombinedGraph
  extends Graph
  implements ICombinedGraph, ISerializable
{
  /** 图形类型标识，子类应覆盖为具体类型 */
  public type: GraphType = GraphType.COMBINED_GRAPH;

  /**
   * 子图形数组，按拼接顺序排列。
   * 渲染和参数化计算均依赖此数组的顺序。
   */
  public graphs: Graph[] = [];

  /**
   * 控制点数组，由 `syncControlPoints` 从子图形聚合而来。
   * 每个控制点的索引可通过 `setControlPoint` 委托到对应子图形。
   */
  public controlPoints: Point3[] = [];

  /** 包围盒，由 `updateBounds` 计算得出 */
  public bounds: Bounds;

  /**
   * 创建一个组合图形实例。
   *
   * @param {Graph[]} graphs - 初始子图形数组，默认为空数组
   * @param {Style} [style] - 图形样式，未提供时使用 `Style.DEFAULT`
   *
   * @example
   * ```ts
   * const combined = new CombinedGraph([line1, line2], style);
   * const empty = new CombinedGraph();
   * ```
   */
  constructor(graphs: Graph[] = [], _style?: Style) {
    super();
    this.graphs = [...graphs];

    this.syncControlPoints();
    this.bounds = this.updateBounds();
    this.id = generateId(this.type);
  }

  /**
   * 判断组合图形是否闭合。
   * 默认返回 `true`，子类可根据实际情况覆盖。
   *
   * @returns {boolean} 是否闭合
   *
   * @example
   * ```ts
   * const combined = new CombinedGraph([line1, line2]);
   * combined.isClosed(); // true
   * ```
   */
  public isClosed(): boolean {
    return true;
  }

  /**
   * 计算组合图形的面积。
   * 基类暂不支持复杂图形的面积计算，子类应覆盖此方法。
   *
   * @returns {number} 面积值
   * @throws {Error} 基类始终抛出错误，提示子类实现
   *
   * @example
   * ```ts
   * // 子类中覆盖
   * class MyShape extends CombinedGraph {
   *   getArea() { return computedArea; }
   * }
   * ```
   */
  public getArea(): number {
    throw new Error("暂不支持复杂图形的面积计算，待后续新增图形积分后计算");
  }

  /**
   * 获取组合图形上距离给定点最近的点及参数信息。
   * 遍历所有子图形，找到全局最近点。
   *
   * @param {Point3} point - 目标点
   * @returns {{ distance: number; closestPoint: Point3; parameter: number }} 包含距离、最近点和全局参数 `t`
   *
   * @example
   * ```ts
   * const result = combined.getClosestPoint(new Point3(10, 20, 0));
   * console.log(result.distance, result.closestPoint, result.parameter);
   * ```
   */
  public getClosestPoint(point: Point3): {
    distance: number;
    closestPoint: Point3;
    parameter: number;
  } {
    const results = this.graphs.map((g) => g.getClosestPoint(point));
    const minDistance = Math.min(...results.map((res) => res.distance));
    return results.find((res) => res.distance === minDistance)!;
  }

  /**
   * 计算组合图形的质心（几何中心）。
   * 默认实现为所有子图形质心的中点递归合并，子类可覆盖以提供更精确的计算。
   *
   * @returns {Point3} 质心坐标
   *
   * @example
   * ```ts
   * const centroid = combined.getCentroid();
   * ```
   */
  public getCentroid(): Point3 {
    if (this.graphs.length === 0) {
      return new Point3(0, 0, 0);
    }
    return this.graphs
      .map((g) => g.getCentroid())
      .reduce((a, b) => GeometryUtils.midpoint(a, b));
  }

  /**
   * 计算组合图形在参数区间 `[tStart, tEnd]` 上的弧长。
   * 先通过 `getTAtInnerGraph` 将全局参数映射到子图形，再分段累加。
   *
   * @param {number} tStart - 起始参数，范围 [0, 1]
   * @param {number} tEnd - 终止参数，范围 [0, 1]
   * @returns {number} 弧长值
   *
   * @example
   * ```ts
   * const totalLength = combined.getLength(0, 1);
   * const halfLength = combined.getLength(0, 0.5);
   * ```
   */
  public getLength(tStart: number, tEnd: number): number {
    const [startGraph, startT] = this.getTAtInnerGraph(tStart);
    const [endGraph, endT] = this.getTAtInnerGraph(tEnd);
    const startIndex = this.graphs.findIndex((g) => g === startGraph);
    const endIndex = this.graphs.findIndex((g) => g === endGraph);
    const graphs = this.graphs.filter((g, i) => i > startIndex && i < endIndex);
    return (
      startGraph.getLength(startT, 1) +
      graphs.reduce((a, b) => a + b.getLength(0, 1), 0) +
      endGraph.getLength(0, endT)
    );
  }

  /**
   * 将全局参数 `t`（范围 [0, 1]）映射到对应的子图形及其局部参数。
   * 根据各子图形的弧长占总弧长的比例进行分配。
   *
   * @param {number} t - 全局参数，范围 [0, 1]
   * @returns {[Graph, number]} 元组：[对应的子图形实例, 子图形内的局部参数]
   * @throws {Error} 当无法找到对应参数时抛出错误
   *
   * @example
   * ```ts
   * const [graph, localT] = combined.getTAtInnerGraph(0.5);
   * // graph 是 t=0.5 所在的子图形，localT 是在该子图形内的局部参数
   * ```
   */
  private getTAtInnerGraph(t: number): [Graph, number] {
    const lengths = this.graphs.map((g) => g.getLength(0, 1));
    const length = lengths.reduce((a, b) => a + b);
    let targetLength = length * t;
    for (const [i, graph] of this.graphs.entries()) {
      if (targetLength > graph.getLength(0, 1)) {
        targetLength -= lengths[i];
        continue;
      }
      return [graph, targetLength / lengths[i]];
    }
    throw new Error("找不到对应参数量的图形");
  }

  /**
   * 获取组合图形在全局参数 `t` 处的点坐标。
   *
   * @param {number} t - 全局参数，范围 [0, 1]
   * @returns {Point3} 参数 `t` 对应的点坐标
   *
   * @example
   * ```ts
   * const startPoint = combined.getPointAt(0);
   * const midPoint = combined.getPointAt(0.5);
   * const endPoint = combined.getPointAt(1);
   * ```
   */
  public getPointAt(t: number): Point3 {
    const [graph, innerT] = this.getTAtInnerGraph(t);
    return graph.getPointAt(innerT);
  }

  /**
   * 获取组合图形在全局参数 `t` 处的切线向量。
   *
   * @param {number} t - 全局参数，范围 [0, 1]
   * @returns {Vector3} 切线向量
   *
   * @example
   * ```ts
   * const tangent = combined.getTangentAt(0.5);
   * ```
   */
  public getTangentAt(t: number): Vector3 {
    const [graph, innerT] = this.getTAtInnerGraph(t);
    return graph.getTangentAt(innerT);
  }

  /**
   * 获取组合图形在全局参数 `t` 处的法线向量。
   *
   * @param {number} t - 全局参数，范围 [0, 1]
   * @returns {Vector3} 法线向量
   *
   * @example
   * ```ts
   * const normal = combined.getNormalAt(0.5);
   * ```
   */
  public getNormalAt(t: number): Vector3 {
    const [graph, innerT] = this.getTAtInnerGraph(t);
    return graph.getNormalAt(innerT);
  }

  /**
   * 计算组合图形的包围盒。
   *
   * 通过 union 所有子图形的 bounds 得到，无需采样。
   * 当没有子图形或所有子图形 bounds 为空时，返回空包围盒。
   *
   * @returns {Bounds} 合并后的包围盒
   *
   * @example
   * ```ts
   * const bounds = combined.updateBounds();
   * console.log(bounds.width, bounds.height);
   * ```
   */
  public updateBounds(): Bounds {
    if (this.graphs.length === 0) {
      return Bounds.empty();
    }

    const childBounds = this.graphs
      .map((g) => g.bounds)
      .filter((b) => b && !b.isEmpty);

    if (childBounds.length === 0) {
      return Bounds.empty();
    }

    return Bounds.union(...childBounds);
  }

  /**
   * 判断给定点是否在组合图形的曲线上（在指定容差范围内）。
   * 只要任一子图形满足条件即返回 `true`。
   *
   * @param {Point3} point - 待检测的点
   * @param {number} [tolerance=MathUtils.EPSILON] - 容差
   * @returns {boolean} 是否在曲线上
   *
   * @example
   * ```ts
   * const onCurve = combined.isPointOnCurve(new Point3(5, 5, 0), 0.01);
   * ```
   */
  isPointOnCurve(
    point: Point3,
    tolerance: number = MathUtils.EPSILON,
  ): boolean {
    return this.graphs.some((graph) => graph.isPointOnCurve(point, tolerance));
  }

  /**
   * 添加一个子图形到组合中。
   * 添加后会自动同步控制点并更新包围盒。
   *
   * @param {Graph} graph - 要添加的子图形
   * @returns {CombinedGraph} 当前实例（支持链式调用）
   *
   * @example
   * ```ts
   * combined.addGraph(new Line(p1, p2, style));
   * ```
   */
  public addGraph(graph: Graph): CombinedGraph {
    this.graphs.push(graph);
    this.syncControlPoints();
    this.bounds = this.updateBounds();
    return this;
  }

  /**
   * 从子图形同步控制点到 `controlPoints` 数组。
   *
   * 遍历所有子图形，收集其控制点（支持 `Float32Array` 和 `Point3[]` 两种格式），
   * 聚合为统一的 `controlPoints` 数组。在子图形变化后调用以更新聚合控制点。
   *
   * @example
   * ```ts
   * combined.syncControlPoints();
   * console.log(combined.controlPoints.length);
   * ```
   */
  public syncControlPoints(): void {
    const allPoints: Point3[] = [];

    for (const graph of this.graphs) {
      if (graph.controlPoints instanceof Float32Array) {
        const arr = graph.controlPoints;
        for (let i = 0; i < arr.length; i += 3) {
          allPoints.push(new Point3(arr[i], arr[i + 1], arr[i + 2]));
        }
      } else {
        allPoints.push(...graph.controlPoints);
      }
    }

    this.controlPoints = allPoints;
  }

  /**
   * 设置指定索引的控制点，委托给对应子图形的 `setControlPoint`。
   *
   * 通过控制点索引定位到对应的子图形，计算子图形内的局部索引，
   * 然后委托子图形处理。设置完成后自动同步控制点并更新包围盒。
   *
   * @param {number} index - 控制点在聚合数组中的索引
   * @param {Point3} point - 新的控制点坐标
   *
   * @example
   * ```ts
   * combined.setControlPoint(0, new Point3(10, 20, 0));
   * ```
   */
  public setControlPoint(index: number, point: Point3): void {
    if (index < 0 || index >= this.controlPoints.length) return;

    // 定位到对应的子图形，委托其 setControlPoint 处理
    let offset = 0;
    for (const graph of this.graphs) {
      const count =
        graph.controlPoints instanceof Float32Array
          ? graph.controlPoints.length / 3
          : graph.controlPoints.length;

      if (index < offset + count) {
        graph.setControlPoint(index - offset, point);
        break;
      }
      offset += count;
    }

    this.syncControlPoints();
    this.bounds = this.updateBounds();
  }

  /**
   * 渲染组合图形的路径到 Canvas 上下文。
   * 第一个子图形独立起笔（moveTo），后续子图形续接路径。
   *
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D 渲染上下文
   * @param {Boolean} dependent - 是否依赖外部 `beginPath` 调用；为 `true` 时自动 `beginPath`
   *
   * @example
   * ```ts
   * combined.renderPath(ctx, true);
   * ctx.stroke();
   * ```
   */
  public renderPath(ctx: CanvasRenderingContext2D, dependent: Boolean): void {
    dependent && ctx.beginPath();
    for (let i = 0; i < this.graphs.length; i++) {
      // 第一个子图形独立起笔（moveTo），后续子图形续接路径
      this.graphs[i].renderPath(ctx, i === 0);
    }
  }

  /**
   * 渲染组合图形。
   *
   * 应用组合图形的样式（填充、描边等），然后逐个渲染子图形。
   * 子图形共享组合图形的样式上下文。
   *
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D 渲染上下文
   *
   * @example
   * ```ts
   * combined.render(ctx);
   * ```
   */
  public render(ctx: CanvasRenderingContext2D, style: Style): void {
    // 应用组合图形的样式
    ctx.save();
    const bounds = this.bounds;
    style.applyToContext(
      ctx,
      Math.abs(bounds.width),
      Math.abs(bounds.height),
    );
    for (const graph of this.graphs) {
      graph.render(ctx, style);
    }

    ctx.restore();
  }

  // ── 序列化 ──

  /**
   * 将组合图形序列化为 JSON 对象。
   *
   * 每个子图形以 `{ $type, $value }` 格式序列化，便于反序列化时通过类型注册表重建。
   *
   * @returns {any} 包含 id、type、graphs、style 的 JSON 对象
   *
   * @example
   * ```ts
   * const json = combined.toJSON();
   * // json = { id: '...', type: GraphType.COMBINED_GRAPH, graphs: [...], style: {...} }
   * ```
   */
  toJSON(): any {
    return {
      id: this.id,
      type: this.type,
      graphs: this.graphs.map((g) => ({
        $type: g.type,
        $value: (g as any).toJSON(),
      })),
    };
  }

  /**
   * 从 JSON 数据重建 CombinedGraph。
   *
   * 注意：`data.graphs` 中每个元素应已由 Serializer 递归解析为 Graph 实例。
   * 如果传入的是原始 JSON（包含 `$type`/`$value`），则需要通过 Serializer 先行反序列化。
   *
   * @param {any} data - 序列化数据，需包含 `graphs`（Graph 实例数组）和 `style`
   * @returns {CombinedGraph} 重建的组合图形实例
   *
   * @example
   * ```ts
   * const combined = CombinedGraph.fromJSON({ id: '...', type: 0, graphs: [line, arc], style: {...} });
   * ```
   */
  static fromJSON(data: any): CombinedGraph {
    // data.graphs 应为已解析的 Graph 实例数组（由 Serializer 处理）
    const graphs: Graph[] = data.graphs ?? [];
    const cg = new CombinedGraph(graphs);
    cg.id = data.id;
    return cg;
  }

  /**
   * 复制组合图形，返回一个包含所有子图形深拷贝的新实例。
   *
   * @returns {this} 复制后的组合图形实例
   *
   * @example
   * ```ts
   * const copy = combined.copy();
   * ```
   */
  public copy(): this {
    const copiedGraphs = this.graphs.map((graph) => graph.copy());
    return new CombinedGraph(copiedGraphs) as this;
  }

  /**
   * 批量添加多个子图形到组合中。
   * 注意：此方法不会自动同步控制点和更新包围盒，调用方需手动触发。
   *
   * @param {Graph[]} graphs - 要添加的子图形数组
   * @returns {CombinedGraph} 当前实例（支持链式调用）
   *
   * @example
   * ```ts
   * combined.addGraphs([line1, line2, arc1]);
   * combined.syncControlPoints();
   * combined.bounds = combined.updateBounds();
   * ```
   */
  public addGraphs(graphs: Graph[]): CombinedGraph {
    this.graphs.push(...graphs);
    return this;
  }

  /**
   * 按图形类型过滤子图形。
   *
   * @param {GraphType} type - 图形类型枚举值
   * @returns {Graph[]} 匹配类型的子图形数组
   *
   * @example
   * ```ts
   * const arcs = combined.getGraphsByType(GraphType.ARC);
   * const lines = combined.getGraphsByType(GraphType.LINE);
   * ```
   */
  public getGraphsByType(type: GraphType): Graph[] {
    return this.graphs.filter((graph) => graph.type === type);
  }

  /**
   * 应用变换矩阵到组合图形。
   *
   * 对所有子图形应用变换，支持递归处理嵌套的组合图形。
   * 变换后自动更新每个子图形及组合图形的包围盒。
   *
   * @param {Matrix4} matrix - 4×4 变换矩阵
   * @returns 变换后的组合图形（当前实例）
   *
   * @example
   * ```ts
   * const matrix = Matrix4.translation(10, 20, 0);
   * combined.transform(matrix);
   * ```
   */
  public transform(matrix: Matrix4): this {
    for (const graph of this.graphs) {
      graph.transform(matrix);
      graph.bounds = graph.updateBounds();
    }

    // 更新组合图形的边界框
    this.bounds = this.updateBounds();
    return this;
  }

  /**
   * 计算与另一个图形的相交点。
   * 遍历所有子图形与目标图形求交，收集所有交点。
   *
   * @param {Graph} other - 另一个图形
   * @returns {Point3[]} 相交点数组
   *
   * @example
   * ```ts
   * const intersections = combined.intersect(otherGraph);
   * intersections.forEach(p => console.log(p.x, p.y));
   * ```
   */
  public intersect(other: Graph): Point3[] {
    const intersections = this.graphs.map((graph) => graph.intersect(other));
    return intersections.flat();
  }

  /**
   * 整体缩放组合图形。
   *
   * 将缩放操作委托给每个子图形，缩放后更新包围盒。
   *
   * @param {Point3} fixedPoint - 固定点（缩放锚点）
   * @param {Point3} dynamicPoint - 动态点（缩放参考点）
   * @param {Vector3} resizeVector - 缩放向量
   *
   * @example
   * ```ts
   * combined.resize(anchor, handle, dragVector);
   * ```
   */
  public resize(
    fixedPoint: Point3,
    dynamicPoint: Point3,
    resizeVector: Vector3,
  ): void {
    for (const graph of this.graphs) {
      graph.resize(fixedPoint, dynamicPoint, resizeVector);
    }
    this.bounds = this.updateBounds();
  }
}
