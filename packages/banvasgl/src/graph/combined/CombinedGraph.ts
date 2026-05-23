import { GRAPHTYPE } from "@/foundation/constants";
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
import {
  ICombinedGraph,
} from "@/types";
import type { ISerializable } from "@/types";
import { generateId } from "@/foundation/utils";

/**
 * CombinedGraph类 - 组合多个图形元素的复合图形
 * 可以包含多个子图形，统一管理和渲染
 */
export default class CombinedGraph
  extends Graph
  implements ICombinedGraph, ISerializable
{
  public type: GRAPHTYPE = GRAPHTYPE.COMBINED_GRAPH;
  public graphs: Graph[] = [];
  public controlPoints: Point3[] = [];
  public style: Style;
  public bounds: Bounds;

  constructor(graphs: Graph[] = [], style?: Style) {
    super();
    this.graphs = [...graphs];
    this.style = style || Style.DEFAULT;

    this.syncControlPoints();
    this.bounds = this.updateBounds();
    this.id = generateId(this.type);
  }

  public isClosed(): boolean {
    return true;
  }

  public getArea(): number {
    throw new Error("暂不支持复杂图形的面积计算，待后续新增图形积分后计算");
  }

  public getClosestPoint(point: Point3): {
    distance: number;
    closestPoint: Point3;
    parameter: number;
  } {
    const results = this.graphs.map((g) => g.getClosestPoint(point));
    const minDistance = Math.min(...results.map((res) => res.distance));
    return results.find((res) => res.distance === minDistance)!;
  }

  public getCentroid(): Point3 {
    if (this.graphs.length === 0) {
      return new Point3(0, 0, 0);
    }
    return this.graphs
      .map((g) => g.getCentroid())
      .reduce((a, b) => GeometryUtils.midpoint(a, b));
  }

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

  public getPointAt(t: number): Point3 {
    const [graph, innerT] = this.getTAtInnerGraph(t);
    return graph.getPointAt(innerT);
  }

  public getTangentAt(t: number): Vector3 {
    const [graph, innerT] = this.getTAtInnerGraph(t);
    return graph.getTangentAt(innerT);
  }

  public getNormalAt(t: number): Vector3 {
    const [graph, innerT] = this.getTAtInnerGraph(t);
    return graph.getNormalAt(innerT);
  }

  /**
   * 计算组合图形的包围盒
   *
   * 通过 union 所有子图形的 bounds 得到，无需采样。
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

  isPointOnCurve(
    point: Point3,
    tolerance: number = MathUtils.EPSILON,
  ): boolean {
    return this.graphs.some((graph) => graph.isPointOnCurve(point, tolerance));
  }

  /**
   * 添加图形到组合中
   */
  public addGraph(graph: Graph): CombinedGraph {
    this.graphs.push(graph);
    this.syncControlPoints();
    this.bounds = this.updateBounds();
    return this;
  }

  /**
   * 从子图形同步控制点到 controlPoints 数组
   *
   * 在子图形变化后调用以更新聚合控制点。
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
   * 设置指定索引的控制点，委托给对应子图形的 setControlPoint
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

  public renderPath(ctx: CanvasRenderingContext2D, dependent: Boolean): void {
    dependent && ctx.beginPath();
    for (let i = 0; i < this.graphs.length; i++) {
      // 第一个子图形独立起笔（moveTo），后续子图形续接路径
      this.graphs[i].renderPath(ctx, i === 0);
    }
  }

  /**
   * 渲染组合图形
   */
  public render(ctx: CanvasRenderingContext2D): void {
    // 应用组合图形的样式
    ctx.save();
    const bounds = this.bounds;
    this.style.applyToContext(
      ctx,
      Math.abs(bounds.width),
      Math.abs(bounds.height),
    );
    for (const graph of this.graphs) {
      graph.render(ctx);
    }

    ctx.restore();
  }

  // ── 序列化 ──
  toJSON(): any {
    return {
      id: this.id,
      type: this.type,
      graphs: this.graphs.map((g) => ({
        $type: g.type,
        $value: (g as any).toJSON(),
      })),
      style: this.style.toJSON(),
    };
  }

  /**
   * 从 JSON 数据重建 CombinedGraph。
   * 注意：data.graphs 中每个元素应已由 Serializer 递归解析为 Graph 实例。
   * 如果传入的是原始 JSON（包含 $type/$value），则需要通过 Serializer 先行反序列化。
   */
  static fromJSON(data: any): CombinedGraph {
    // data.graphs 应为已解析的 Graph 实例数组（由 Serializer 处理）
    const graphs: Graph[] = data.graphs ?? [];
    const cg = new CombinedGraph(
      graphs,
      data.style ? Style.fromJSON(data.style) : undefined,
    );
    cg.id = data.id;
    return cg;
  }

  /**
   * 复制组合图形
   */
  public copy(): this {
    const copiedGraphs = this.graphs.map((graph) => graph.copy());
    return new CombinedGraph(copiedGraphs, this.style.copy()) as this;
  }

  /**
   * 批量添加图形
   */
  public addGraphs(graphs: Graph[]): CombinedGraph {
    this.graphs.push(...graphs);
    return this;
  }

  /**
   * 按类型过滤图形
   */
  public getGraphsByType(type: GRAPHTYPE): Graph[] {
    return this.graphs.filter((graph) => graph.type === type);
  }

  /**
   * 应用变换矩阵到组合图形
   * 对所有子图形应用变换，支持递归处理嵌套的组合图形
   * @param matrix 变换矩阵
   * @returns 变换后的组合图形
   */
  public transform(matrix: Matrix4): CombinedGraph {
    for (const graph of this.graphs) {
      graph.transform(matrix);
      graph.bounds = graph.updateBounds();
    }

    // 更新组合图形的边界框
    this.bounds = this.updateBounds();
    return this;
  }

  /**
   * 计算与另一个图形的相交点
   * @param other 另一个图形
   * @returns 相交点数组
   */
  public intersect(other: Graph): Point3[] {
    const intersections = this.graphs.map((graph) => graph.intersect(other));
    return intersections.flat();
  }

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
