import { GRAPHTYPE } from "@/core/constants";
import Graph from "../base/Graph";
import { Point3 } from "@/index.backend";
import Style from "@/core/style/Style";
import Bounds from "../base/Bounds";

export default class DenseTrajectory extends Graph {
  public type: GRAPHTYPE = GRAPHTYPE.DENSETRAJECTORY;
  public controlPoints: Float32Array;
  public width: number;
  public height: number;
  public style: Style;
  constructor(points: Point3[] | Float32Array, style: Style = Style.DEFAULT) {
    super();
    if (points instanceof Float32Array) {
      this.controlPoints = Float32Array.from(points);
    } else {
      this.controlPoints = Float32Array.from(points.map((p) => [p.x, p.y, p.z]).flat());
    }
    const xs = this.controlPoints.filter((_, i) => i % 3 === 0);
    const ys = this.controlPoints.filter((_, i) => (i + 1) % 3 === 0);
    const maxX = Math.max(...xs);
    const minX = Math.min(...xs);
    const maxY = Math.max(...ys);
    const minY = Math.min(...ys);
    this.width = maxX - minX;
    this.height = maxY - minY;

    this.style = style;
  }

  public renderPath(ctx: CanvasRenderingContext2D, dependent: Boolean): void {
    dependent && ctx.beginPath();
    ctx.moveTo(this.controlPoints[0], this.controlPoints[1]);
    const length = this.controlPoints.length / 3;
    for (let i = 1; i < length; i++) {
      ctx.lineTo(this.controlPoints[i * 3], this.controlPoints[i * 3 + 1]);
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    this.style.applyToContext(ctx, this.width, this.height);
    this.renderPath(ctx, true);
    ctx.stroke();
    ctx.restore();
  }
  public copy(): this {
    return new DenseTrajectory(Float32Array.from(this.controlPoints), this.style.copy()) as this;
  }

  public isDenseTrajectory(): boolean {
    return true;
  }

  protected calculateBounds(): Bounds {
    if (this.controlPoints.length === 0) {
      return Bounds.empty();
    }

    const xs = this.controlPoints.filter((_, i) => i % 3 === 0);
    const ys = this.controlPoints.filter((_, i) => (i + 1) % 3 === 0);
    const maxX = Math.max(...xs);
    const minX = Math.min(...xs);
    const maxY = Math.max(...ys);
    const minY = Math.min(...ys);

    return new Bounds(minX, minY, maxX - minX, maxY - minY);
  }

  public isPointOnCurve(p: Point3, tolerance: number = 1e-6): boolean {
    return false;
  }
}
