import { GRAPHTYPE } from "@/core/constants";
import Style from "@/core/style/Style";
import { Point3 } from "@/core/math";
import CombinedGraph from "../CombinedGraph";
import Line from "../../analytic/Line";

/**
 * Polygon类 - 多边形图形基类
 * 基于CombinedGraph，专门用于创建和管理多边形
 */
export default class Polygon extends CombinedGraph {
  public type: GRAPHTYPE = GRAPHTYPE.POLYGON;
  public vertices: Point3[] = [];
  public isClosed: boolean = true;
  public fillMode: "fill" | "stroke" | "both" = "both";

  constructor(vertices: Point3[] = [], style?: Style, isClosed: boolean = true) {
    // 先根据传入顶点临时构建线段，避免初始bounds为空
    const vs = vertices.map((v) => v.copy());
    const lines: Line[] = [];
    if (vs.length >= 2) {
      for (let i = 0; i < vs.length; i++) {
        const current = vs[i];
        const next = vs[(i + 1) % vs.length];
        if (!isClosed && i === vs.length - 1) break;
        lines.push(new Line(current, next, style));
      }
    }
    super(lines, style);
    this.vertices = vs;
    this.isClosed = isClosed;
  }

  /**
   * 从顶点构建多边形
   */
  protected buildPolygonFromVertices(): void {
    this.graphs = [];
    if (this.vertices.length < 2) {
      return;
    }

    // 创建边线
    for (let i = 0; i < this.vertices.length; i++) {
      const current = this.vertices[i];
      const next = this.vertices[(i + 1) % this.vertices.length];

      // 如果不是闭合多边形且是最后一条边，跳过
      if (!this.isClosed && i === this.vertices.length - 1) {
        break;
      }

      const line = new Line(current, next, this.style);
      this.addGraph(line);
    }
    // 重建后刷新组合bounds
    this.setBounds(this.calculateBounds());
  }

  /**
   * 设置填充模式
   */
  public setFillMode(mode: "fill" | "stroke" | "both"): Polygon {
    this.fillMode = mode;
    return this;
  }

  /**
   * 获取多边形的中心点
   */
  public getPolygonCenter(): Point3 {
    if (this.vertices.length === 0) {
      return new Point3(0, 0, 0);
    }

    const sumX = this.vertices.reduce((sum, vertex) => sum + vertex.x, 0);
    const sumY = this.vertices.reduce((sum, vertex) => sum + vertex.y, 0);
    const sumZ = this.vertices.reduce((sum, vertex) => sum + vertex.z, 0);

    return new Point3(sumX / this.vertices.length, sumY / this.vertices.length, sumZ / this.vertices.length);
  }

  /**
   * 计算多边形面积（使用鞋带公式）
   */
  public getArea(): number {
    if (this.vertices.length < 3) {
      return 0;
    }

    let area = 0;
    for (let i = 0; i < this.vertices.length; i++) {
      const current = this.vertices[i];
      const next = this.vertices[(i + 1) % this.vertices.length];
      area += current.x * next.y - next.x * current.y;
    }
    return Math.abs(area) / 2;
  }

  /**
   * 计算多边形周长
   */
  public getPerimeter(): number {
    if (this.vertices.length < 2) {
      return 0;
    }

    let perimeter = 0;
    for (let i = 0; i < this.vertices.length; i++) {
      const current = this.vertices[i];
      const next = this.vertices[(i + 1) % this.vertices.length];
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
    if (this.vertices.length < 3) {
      return false;
    }

    let inside = false;
    for (let i = 0, j = this.vertices.length - 1; i < this.vertices.length; j = i++) {
      const vi = this.vertices[i];
      const vj = this.vertices[j];

      if (vi.y > point.y !== vj.y > point.y && point.x < ((vj.x - vi.x) * (point.y - vi.y)) / (vj.y - vi.y) + vi.x) {
        inside = !inside;
      }
    }
    return inside;
  }

  /**
   * 获取所有控制点（返回顶点）
   */
  public get controlPoints(): Point3[] {
    return this.vertices.map((v) => v.copy());
  }

  /**
   * 渲染多边形
   */
  public render(ctx: CanvasRenderingContext2D): void {
    if (this.vertices.length < 2) {
      return;
    }
    const bounds = this.getBounds();

    this.style.applyToContext(ctx, bounds.width, bounds.height);

    ctx.beginPath();
    ctx.moveTo(this.vertices[0].x, this.vertices[0].y);

    for (let i = 1; i < this.vertices.length; i++) {
      ctx.lineTo(this.vertices[i].x, this.vertices[i].y);
    }

    if (this.isClosed) {
      ctx.closePath();
    }

    // 根据填充模式进行绘制
    if (this.fillMode === "fill" || this.fillMode === "both") {
      ctx.fill();
    }
    if (this.fillMode === "stroke" || this.fillMode === "both") {
      ctx.stroke();
    }
  }

  /**
   * 复制多边形
   */
  public copy(): this {
    return new Polygon(this.vertices, this.style.copy(), this.isClosed) as this;
  }
}

// 类型守卫函数
export function isPolygon(graph: any): graph is Polygon {
  return graph !== null && graph !== undefined && graph.type === GRAPHTYPE.POLYGON;
}
