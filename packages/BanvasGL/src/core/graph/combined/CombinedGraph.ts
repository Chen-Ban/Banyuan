import { GRAPHTYPE } from "@/core/constants";
import Style from "@/core/style/Style";
import { Point3, Vector3, Matrix4 } from "@/core/math";
import Graph from "../base/Graph";
import Bounds from "../base/Bounds";
import { isDenseTrajectory, isLine } from "../utils/typeGuards";
import { PointUtils } from "@/core/graph/utils/PointUtils";
import {
  isAnalyticGraph,
  isCombinedGraph,
  isCombinedGraphType,
  isMediaElement,
  isTextGraph,
} from "../utils/typeGuards";
import { AnalyticGraph } from "../analytic";

/**
 * CombinedGraph类 - 组合多个图形元素的复合图形
 * 可以包含多个子图形，统一管理和渲染
 */
export default class CombinedGraph extends Graph {
  public type: GRAPHTYPE = GRAPHTYPE.COMBINED_GRAPH;
  public graphs: Graph[] = [];
  public style: Style;

  constructor(graphs: Graph[] = [], style?: Style) {
    super();
    this.graphs = [...graphs];
    this.style = style || new Style();

    // 在构造函数中立即计算边界框，确保View能获取到正确的初始尺寸
    this.setBounds(this.calculateBounds());
  }

  public getArea(): number {
    throw new Error("暂不支持复杂图形的面积计算，待后续新增图形积分后计算");
  }

  public getClosestPoint(point: Point3): { distance: number; closestPoint: Point3; parameter: number } {
    const results = this.graphs.map((g) => g.getClosestPoint(point));
    const minDistance = Math.min(...results.map((res) => res.distance));
    return results.find((res) => res.distance === minDistance)!;
  }

  public getCentroid(): Point3 {
    return this.graphs.map((g) => this.getCentroid()).reduce((a, b) => PointUtils.midpoint(a, b));
  }

  public getLength(tStart: number, tEnd: number): number {
    const [startGraph, startT] = this.getTAtInnerGraph(tStart);
    const [endGraph, endT] = this.getTAtInnerGraph(tEnd);
    const startIndex = this.graphs.findIndex((g) => g === startGraph);
    const endIndex = this.graphs.findIndex((g) => g === endGraph);
    const graphs = this.graphs.filter((g, i) => i > startIndex && i < endIndex);
    return (
      startGraph.getLength(startT, 1) + graphs.reduce((a, b) => a + b.getLength(0, 1), 0) + endGraph.getLength(0, endT)
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
   */
  public calculateBounds(): Bounds {
    if (this.graphs.length === 0) {
      return Bounds.empty();
    }

    // 收集所有采样点
    const samplePoints: Point3[] = [];

    for (const graph of this.graphs) {
      // 1. 分析图形（解析式图形）：使用采样点
      if (isAnalyticGraph(graph)) {
        const steps = 64;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          samplePoints.push(graph.getPointAt(t));
        }
      }
      // 2. 媒体图形（图片、视频）：从 bounds 获取四个角点
      else if (isMediaElement(graph)) {
        const bounds = graph.getBounds();
        if (bounds && !bounds.isEmpty) {
          samplePoints.push(new Point3(bounds.x, bounds.y, 0));
          samplePoints.push(new Point3(bounds.x + bounds.width, bounds.y, 0));
          samplePoints.push(new Point3(bounds.x + bounds.width, bounds.y + bounds.height, 0));
          samplePoints.push(new Point3(bounds.x, bounds.y + bounds.height, 0));
        }
      }
      // 3. 字体图形（文本元素、文本段落）：从 bounds 获取四个角点
      else if (isTextGraph(graph)) {
        const bounds = graph.getBounds();
        if (bounds && !bounds.isEmpty) {
          samplePoints.push(new Point3(bounds.x, bounds.y, 0));
          samplePoints.push(new Point3(bounds.x + bounds.width, bounds.y, 0));
          samplePoints.push(new Point3(bounds.x + bounds.width, bounds.y + bounds.height, 0));
          samplePoints.push(new Point3(bounds.x, bounds.y + bounds.height, 0));
        }
      }
      // 4. 合并图形（组合图形、复杂图形）：递归获取其 bounds 的四个角点
      else if (isCombinedGraphType(graph)) {
        const bounds = graph.getBounds();
        if (bounds && !bounds.isEmpty) {
          samplePoints.push(new Point3(bounds.x, bounds.y, 0));
          samplePoints.push(new Point3(bounds.x + bounds.width, bounds.y, 0));
          samplePoints.push(new Point3(bounds.x + bounds.width, bounds.y + bounds.height, 0));
          samplePoints.push(new Point3(bounds.x, bounds.y + bounds.height, 0));
        }
      }
      // 5. 其他图形（如密集轨迹等）：从控制点采样
      else if (isDenseTrajectory(graph)) {
        const otherGraph = graph;
        for (let i = 0; i < otherGraph.controlPoints.length; i += 3) {
          samplePoints.push(
            new Point3(otherGraph.controlPoints[i], otherGraph.controlPoints[i + 1], otherGraph.controlPoints[i + 2])
          );
        }
      }
    }

    // 如果没有采样点，返回空边界
    if (samplePoints.length === 0) {
      return Bounds.empty();
    }

    // 从采样点计算包围盒
    let minX = samplePoints[0].x;
    let maxX = samplePoints[0].x;
    let minY = samplePoints[0].y;
    let maxY = samplePoints[0].y;

    for (let i = 1; i < samplePoints.length; i++) {
      const p = samplePoints[i];
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }

    return new Bounds(minX, minY, maxX - minX, maxY - minY);
  }

  isPointOnCurve(point: Point3, tolerance: number = 1e-6): boolean {
    return this.graphs.some((graph) => graph.isPointOnCurve(point, tolerance));
  }

  /**
   * 添加图形到组合中
   */
  public addGraph(graph: Graph): CombinedGraph {
    this.graphs.push(graph);
    return this;
  }

  /**
   * 获取所有控制点
   */
  public get controlPoints(): Point3[] {
    const allPoints: Point3[] = [];

    for (const graph of this.graphs) {
      if (graph.controlPoints instanceof Float32Array) {
        for (let i = 0; i < graph.controlPoints.length; i += 3) {
          allPoints.push(new Point3(graph.controlPoints[i], graph.controlPoints[i + 1], graph.controlPoints[i + 2]));
        }
      } else {
        allPoints.push(...graph.controlPoints.map((p) => p.copy()));
      }
    }

    return allPoints;
  }

  public renderPath(ctx: CanvasRenderingContext2D, dependent: Boolean): void {
    dependent && ctx.beginPath();
    if (this.graphs.length === 0) {
      return;
    }

    let lastEndPoint: Point3 | null = null;
    let isFirstGraph = true;

    for (let i = 0; i < this.graphs.length; i++) {
      const currentGraph = this.graphs[i];

      if (isFirstGraph) {
        // 第一个图形，直接渲染
        currentGraph.renderPath(ctx, true);
        lastEndPoint = this.getGraphEndPoint(currentGraph);
        isFirstGraph = false;
      } else {
        // 获取当前图形的起始点
        const currentStartPoint = this.getGraphStartPoint(currentGraph);

        if (!lastEndPoint || !PointUtils.isSamePoint(lastEndPoint, currentStartPoint)) return;

        // 渲染当前图形的路径（不包含moveTo）
        this.renderGraphPathWithoutMoveTo(ctx, currentGraph);
        lastEndPoint = this.getGraphEndPoint(currentGraph);
      }
    }
  }
  /**
   * 渲染图形路径但不包含moveTo（避免路径分离）
   */
  private renderGraphPathWithoutMoveTo(ctx: CanvasRenderingContext2D, graph: Graph): void {
    if (isLine(graph)) {
      // 对于线段，只使用lineTo
      ctx.lineTo(graph.endPoint.x, graph.endPoint.y);
    } else if (graph.type === GRAPHTYPE.BEZIER) {
      // 对于贝塞尔曲线，需要特殊处理
      const bezier = graph as any;
      if (bezier.controlPoints.length === 3) {
        ctx.quadraticCurveTo(
          bezier.controlPoints[1].x,
          bezier.controlPoints[1].y,
          bezier.endPoint.x,
          bezier.endPoint.y
        );
      } else if (bezier.controlPoints.length === 4) {
        ctx.bezierCurveTo(
          bezier.controlPoints[1].x,
          bezier.controlPoints[1].y,
          bezier.controlPoints[2].x,
          bezier.controlPoints[2].y,
          bezier.endPoint.x,
          bezier.endPoint.y
        );
      }
    } else {
      // 其他类型，使用默认渲染
      graph.renderPath(ctx, false);
    }
  }

  /**
   * 获取图形的起始点
   */
  private getGraphStartPoint(graph: Graph): Point3 {
    if (graph.controlPoints instanceof Float32Array) {
      return new Point3(graph.controlPoints[0], graph.controlPoints[1], graph.controlPoints[2]);
    } else {
      return graph.controlPoints[0].copy();
    }
  }

  /**
   * 获取图形的结束点
   */
  private getGraphEndPoint(graph: Graph): Point3 {
    if (graph.controlPoints instanceof Float32Array) {
      const length = graph.controlPoints.length;
      return new Point3(
        graph.controlPoints[length - 3],
        graph.controlPoints[length - 2],
        graph.controlPoints[length - 1]
      );
    } else {
      const points = graph.controlPoints;
      return points[points.length - 1].copy();
    }
  }

  /**
   * 渲染组合图形
   */
  public render(ctx: CanvasRenderingContext2D): void {
    // 应用组合图形的样式
    ctx.save();
    const bounds = this.getBounds();
    this.style.applyToContext(ctx, bounds.width, bounds.height);
    for (const graph of this.graphs) {
      graph.render(ctx);
    }

    ctx.restore();
  }

  /**
   * 复制组合图形
   */
  public copy(): this {
    const copiedGraphs = this.graphs.map((graph) => graph.copy());
    return new CombinedGraph(copiedGraphs, this.style.copy()) as this;
  }

  /**
   * 设置样式
   */
  public setStyle(style: Style): CombinedGraph {
    this.style = style;
    return this;
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
      // 如果是解析式图形，直接调用其transform方法
      if (isAnalyticGraph(graph) || isCombinedGraph(graph)) {
        graph.transform(matrix);
      }
      // 其他类型的图形，手动变换控制点
      else {
        this.transformGraphControlPoints(graph, matrix);
      }
      graph.setBounds(graph.calculateBounds());
    }

    // 更新组合图形的边界框
    this.setBounds(this.calculateBounds());
    return this;
  }

  /**
   * 手动变换图形的控制点
   * @param graph 要变换的图形
   * @param matrix 变换矩阵
   */
  private transformGraphControlPoints(graph: Graph, matrix: Matrix4): void {
    if (graph.controlPoints instanceof Float32Array) {
      // 对于Float32Array类型的控制点，逐个变换
      for (let i = 0; i < graph.controlPoints.length; i += 3) {
        const point = new Point3(graph.controlPoints[i], graph.controlPoints[i + 1], graph.controlPoints[i + 2]);
        const transformed = matrix.multiply(point);
        graph.controlPoints[i] = transformed.x;
        graph.controlPoints[i + 1] = transformed.y;
        graph.controlPoints[i + 2] = transformed.z;
      }
    } else {
      // 对于Point3[]类型的控制点，逐个变换
      for (let i = 0; i < graph.controlPoints.length; i++) {
        graph.controlPoints[i] = matrix.multiply(graph.controlPoints[i]);
      }
    }
  }
}
