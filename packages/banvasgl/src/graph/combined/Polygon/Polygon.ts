import { GRAPHTYPE } from "@/foundation/constants";
import Style from "@/foundation/style/Style";
import { Point3, Vector3, Matrix4 } from "@/foundation/math";
import CombinedGraph from "@/graph/combined/CombinedGraph";
import Line from "@/graph/analytic/Line";
import { isGraphType, IPolygon, ISerializable } from '@/types';
import { generateId } from '@/foundation/utils';

/**
 * Polygon类 - 多边形图形基类
 * 基于CombinedGraph，专门用于创建和管理多边形
 */
export default class Polygon extends CombinedGraph implements IPolygon, ISerializable {
  public type: GRAPHTYPE = GRAPHTYPE.POLYGON;
  public closed: boolean = true;

  public override isClosed(): boolean {
    return this.closed;
  }

  constructor(points: Point3[] = [], style?: Style, closed: boolean = true) {
    // 先根据传入顶点临时构建线段，避免初始bounds为空
    const vs = points.map((v) => v.copy());
    const lines: Line[] = [];
    if (vs.length >= 2) {
      for (let i = 0; i < vs.length; i++) {
        const current = vs[i];
        const next = vs[(i + 1) % vs.length];
        if (!closed && i === vs.length - 1) break;
        lines.push(new Line(current, next, style));
      }
    }
    super(lines, style);
    this.controlPoints = vs;
    this.closed = closed;
    this.id = generateId(this.type)
  }

  /**
   * 从顶点构建多边形
   */
  protected rebuildEdges(): void {
    this.graphs = [];
    if (this.controlPoints.length < 2) {
      return;
    }
    // 创建边线
    for (let i = 0; i < this.controlPoints.length; i++) {
      const current = this.controlPoints[i];
      const next = this.controlPoints[(i + 1) % this.controlPoints.length];

      // 如果不是闭合多边形且是最后一条边，跳过
      if (!this.closed && i === this.controlPoints.length - 1) {
        break;
      }

      const line = new Line(current, next, this.style);
      this.addGraph(line);
    }
    this.bounds = this.updateBounds()
  }

  /**
   * 应用变换矩阵到多边形
   */
  public override transform(matrix: Matrix4): CombinedGraph {
    super.transform(matrix);
    this.syncControlPoints();
    return this;
  }

  /**
   * 从子图形聚合控制点并过滤重复点（首尾相接的共享点）
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
   * 获取多边形的中心点
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
   * 计算多边形面积（使用鞋带公式）
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
   * 计算多边形周长
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
   * 检查点是否在多边形内部（射线法）
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
   * 获取指定索引的顶点（带边界检查）
   */
  public getVertex(index: number): Point3 {
    if (index < 0 || index >= this.controlPoints.length) {
      throw new Error(`顶点索引越界：${index}，共 ${this.controlPoints.length} 个顶点`)
    }
    return this.controlPoints[index].copy()
  }

  /**
   * 设置指定索引的控制点，直接修改 controlPoints 并重建多边形
   */
  public override setControlPoint(index: number, point: Point3): void {
    if (index < 0 || index >= this.controlPoints.length) return
    this.controlPoints[index] = point.copy()
    this.rebuildEdges()
  }

  /**
   * 渲染多边形
   */
  public render(ctx: CanvasRenderingContext2D): void {
    if (this.controlPoints.length < 2) {
      return;
    }
    const bounds = this.bounds;

    this.style.applyToContext(ctx, Math.abs(bounds.width), Math.abs(bounds.height));

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
  public resize(fixedPoint: Point3, dynamicPoint: Point3, resizeVector: Vector3): void {
    const graphs = this.graphs
    if (!graphs.every(graph => isGraphType(graph, GRAPHTYPE.LINE))) throw new Error("多边形边只能为Line")
    for (const graph of graphs) {
      graph.resize(fixedPoint, dynamicPoint, resizeVector)
    }
    this.syncControlPoints()
    this.bounds = this.updateBounds()
  }

  // ── 序列化 ──
  public toJSON(): any {
    return {
      id: this.id,
      type: this.type,
      controlPoints: this.controlPoints.map(v => v.toJSON()),
      closed: this.closed,
      style: this.style.toJSON(),
    }
  }

  public static fromJSON(data: any): Polygon {
    const points = data.controlPoints.map((v: any) => Point3.fromJSON(v))
    const style = Style.fromJSON(data.style)
    const polygon = new Polygon(points, style, data.closed ?? data.isClosed)
    polygon.id = data.id
    return polygon
  }

  /**
   * 复制多边形
   */
  public copy(): this {
    return new Polygon(this.controlPoints, this.style.copy(), this.closed) as this;
  }
}
