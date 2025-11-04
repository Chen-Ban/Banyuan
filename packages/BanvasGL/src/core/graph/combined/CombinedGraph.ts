import { GRAPHTYPE } from "@/constants";
import Style from "@/core/style/Style";
import { Point3 } from "@/core/math";
import Graph, { GraphOptions } from "../base/Graph";
import Bounds from "../base/Bounds";
import { Line } from "../analytic";
import { isLine } from "../utils/typeGuards";
import { PointUtils } from "@/core/utils/PointUtils";
import { isAnalyticGraph } from "../utils/typeGuards";

/**
 * CombinedGraph类 - 组合多个图形元素的复合图形
 * 可以包含多个子图形，统一管理和渲染
 */
export default class CombinedGraph<T extends Graph> extends Graph {
  public type: GRAPHTYPE = GRAPHTYPE.COMBINED_GRAPH;
  public graphs: T[] = [];
  public style: Style;

  constructor(graphs: T[] = [], style?: Style, options?: GraphOptions) {
    super(options);
    this.graphs = [...graphs];
    this.style = style || new Style();

    // 在构造函数中立即计算边界框，确保View能获取到正确的初始尺寸
    this.setBounds(this.calculateBounds());
  }

  /**
   * 计算组合图形的包围盒
   */
  protected calculateBounds(): Bounds {
    if (this.graphs.length === 0) {
      return Bounds.empty();
    }

    // 基于参数化方式采样各子图形的极值点来计算组合包围盒
    const steps = 64;
    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;

    for (const graph of this.graphs) {
      if (isAnalyticGraph(graph)) {
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const p = graph.getPointAt(t);
          minX = Math.min(minX, p.x);
          maxX = Math.max(maxX, p.x);
          minY = Math.min(minY, p.y);
          maxY = Math.max(maxY, p.y);
        }
      } else {
        // 非解析式图形：优先使用其bounds；若无效则使用controlPoints
        const b = graph.getBounds();
        if (b && (b.width > 0 || b.height > 0)) {
          minX = Math.min(minX, b.x);
          maxX = Math.max(maxX, b.x + b.width);
          minY = Math.min(minY, b.y);
          maxY = Math.max(maxY, b.y + b.height);
        } else if (graph.controlPoints) {
          if (graph.controlPoints instanceof Float32Array) {
            for (let i = 0; i < graph.controlPoints.length; i += 3) {
              const x = graph.controlPoints[i];
              const y = graph.controlPoints[i + 1];
              minX = Math.min(minX, x);
              maxX = Math.max(maxX, x);
              minY = Math.min(minY, y);
              maxY = Math.max(maxY, y);
            }
          } else {
            for (const p of graph.controlPoints) {
              minX = Math.min(minX, p.x);
              maxX = Math.max(maxX, p.x);
              minY = Math.min(minY, p.y);
              maxY = Math.max(maxY, p.y);
            }
          }
        }
      }
    }

    return new Bounds(minX, minY, maxX - minX, maxY - minY);
  }

  /**
   * 添加图形到组合中
   */
  public addGraph(graph: T): CombinedGraph<T> {
    this.graphs.push(graph);
    return this;
  }

  /**
   * 移除指定图形
   */
  public removeGraph(graphId: string): CombinedGraph<T> {
    this.graphs = this.graphs.filter((graph) => graph.id !== graphId);
    return this;
  }

  /**
   * 获取指定ID的图形
   */
  public getGraph(graphId: string): Graph | undefined {
    return this.graphs.find((graph) => graph.id === graphId);
  }

  /**
   * 清空所有图形
   */
  public clearGraphs(): CombinedGraph<T> {
    this.graphs = [];
    return this;
  }

  /**
   * 获取图形数量
   */
  public getGraphCount(): number {
    return this.graphs.length;
  }

  /**
   * 获取所有控制点
   */
  public get controlPoints(): Point3[] {
    const allPoints: Point3[] = [];

    for (const graph of this.graphs) {
      if (graph.controlPoints instanceof Float32Array) {
        for (let i = 0; i < graph.controlPoints.length; i += 3) {
          allPoints.push(
            new Point3(
              graph.controlPoints[i],
              graph.controlPoints[i + 1],
              graph.controlPoints[i + 2]
            )
          );
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

        if (
          !lastEndPoint ||
          !PointUtils.isSamePoint(lastEndPoint, currentStartPoint)
        )
          return;

        // 渲染当前图形的路径（不包含moveTo）
        this.renderGraphPathWithoutMoveTo(ctx, currentGraph);
        lastEndPoint = this.getGraphEndPoint(currentGraph);
      }
    }
  }
  /**
   * 渲染图形路径但不包含moveTo（避免路径分离）
   */
  private renderGraphPathWithoutMoveTo(
    ctx: CanvasRenderingContext2D,
    graph: Graph
  ): void {
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
      return new Point3(
        graph.controlPoints[0],
        graph.controlPoints[1],
        graph.controlPoints[2]
      );
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
    return new CombinedGraph<T>(copiedGraphs, this.style.copy()) as this;
  }

  /**
   * 设置样式
   */
  public setStyle(style: Style): CombinedGraph<T> {
    this.style = style;
    return this;
  }

  /**
   * 批量添加图形
   */
  public addGraphs(graphs: T[]): CombinedGraph<T> {
    this.graphs.push(...graphs);
    return this;
  }

  /**
   * 检查是否包含指定图形
   */
  public containsGraph(graphId: string): boolean {
    return this.graphs.some((graph) => graph.id === graphId);
  }

  /**
   * 获取所有图形的ID列表
   */
  public getGraphIds(): string[] {
    return this.graphs.map((graph) => graph.id);
  }

  /**
   * 按类型过滤图形
   */
  public getGraphsByType(type: GRAPHTYPE): Graph[] {
    return this.graphs.filter((graph) => graph.type === type);
  }

  /**
   * 获取组合图形的中心点
   */
  public getCenter(): Point3 {
    if (this.graphs.length === 0) {
      return new Point3(0, 0, 0);
    }

    const allPoints = this.controlPoints;
    if (allPoints.length === 0) {
      return new Point3(0, 0, 0);
    }

    const sumX = allPoints.reduce((sum, point) => sum + point.x, 0);
    const sumY = allPoints.reduce((sum, point) => sum + point.y, 0);
    const sumZ = allPoints.reduce((sum, point) => sum + point.z, 0);

    return new Point3(
      sumX / allPoints.length,
      sumY / allPoints.length,
      sumZ / allPoints.length
    );
  }
}
