import { GRAPHTYPE } from "@/core/constants";
import Graph from "../base/Graph";
import { Point3, Vector3, Matrix4 } from "@/core/math";
import Style from "@/core/style/Style";
import Bounds from "../base/Bounds";
import { Line } from "../analytic";

export default class DenseTrajectory extends Graph {
  public type: GRAPHTYPE = GRAPHTYPE.DENSETRAJECTORY;
  public controlPoints: Float32Array;
  public style: Style;
  public bounds: Bounds;
  public transfromOrigin: Point3;

  constructor(points: Float32Array, style: Style = Style.DEFAULT) {
    super();
    this.style = style;
    this.controlPoints = Float32Array.from(points);
    this.bounds = this.updateBounds()
    this.transfromOrigin = new Point3(this.controlPoints[0], this.controlPoints[1], 0)
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
    this.style.applyToContext(ctx, this.bounds.width, this.bounds.height);
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

  public updateBounds(orientationX?: boolean, orientationY?: boolean): Bounds {
    let points = []
    const length = this.controlPoints.length
    for (let i = 0; i < length - 2; i + 3) {
      points.push(new Point3(this.controlPoints[i], this.controlPoints[i + 1], this.controlPoints[i + 2]))
    }
    return Bounds.fromPoints(points, orientationX ?? this.bounds?.width > 0, orientationY ?? this.bounds.height > 0)
  }

  public isPointOnCurve(p: Point3, tolerance: number = 1e-6): boolean {
    return false;
  }

  public getPointAt(t: number): Point3 {
    const pointCount = this.controlPoints.length / 3;
    if (pointCount === 0) return new Point3(0, 0, 0);
    if (pointCount === 1) {
      return new Point3(this.controlPoints[0], this.controlPoints[1], this.controlPoints[2]);
    }

    const clampedT = Math.max(0, Math.min(1, t));
    const index = clampedT * (pointCount - 1);
    const i = Math.floor(index);
    const fraction = index - i;

    if (i >= pointCount - 1) {
      const lastIdx = (pointCount - 1) * 3;
      return new Point3(this.controlPoints[lastIdx], this.controlPoints[lastIdx + 1], this.controlPoints[lastIdx + 2]);
    }

    const idx1 = i * 3;
    const idx2 = (i + 1) * 3;
    return new Point3(
      this.controlPoints[idx1] + fraction * (this.controlPoints[idx2] - this.controlPoints[idx1]),
      this.controlPoints[idx1 + 1] + fraction * (this.controlPoints[idx2 + 1] - this.controlPoints[idx1 + 1]),
      this.controlPoints[idx1 + 2] + fraction * (this.controlPoints[idx2 + 2] - this.controlPoints[idx1 + 2])
    );
  }

  public getTangentAt(t: number): Vector3 {
    const pointCount = this.controlPoints.length / 3;
    if (pointCount < 2) return new Vector3(1, 0, 0);

    const clampedT = Math.max(0, Math.min(1, t));
    const index = clampedT * (pointCount - 1);
    const i = Math.floor(index);

    if (i >= pointCount - 1) {
      const idx1 = (pointCount - 2) * 3;
      const idx2 = (pointCount - 1) * 3;
      return new Vector3(
        this.controlPoints[idx2] - this.controlPoints[idx1],
        this.controlPoints[idx2 + 1] - this.controlPoints[idx1 + 1],
        this.controlPoints[idx2 + 2] - this.controlPoints[idx1 + 2]
      );
    }

    const idx1 = i * 3;
    const idx2 = (i + 1) * 3;
    return new Vector3(
      this.controlPoints[idx2] - this.controlPoints[idx1],
      this.controlPoints[idx2 + 1] - this.controlPoints[idx1 + 1],
      this.controlPoints[idx2 + 2] - this.controlPoints[idx1 + 2]
    );
  }

  public getNormalAt(t: number): Vector3 {
    const tangent = this.getTangentAt(t);
    return new Vector3(-tangent.y, tangent.x, 0);
  }

  public getClosestPoint(point: Point3): {
    distance: number;
    closestPoint: Point3;
    parameter: number;
  } {
    const pointCount = this.controlPoints.length / 3;
    if (pointCount === 0) {
      return { distance: Infinity, closestPoint: new Point3(0, 0, 0), parameter: 0 };
    }
    if (pointCount === 1) {
      const p = new Point3(this.controlPoints[0], this.controlPoints[1], this.controlPoints[2]);
      return {
        distance: Math.sqrt(Math.pow(point.x - p.x, 2) + Math.pow(point.y - p.y, 2)),
        closestPoint: p,
        parameter: 0,
      };
    }

    let minDistance = Infinity;
    let closestPoint = new Point3(0, 0, 0);
    let closestT = 0;

    for (let i = 0; i < pointCount - 1; i++) {
      const idx1 = i * 3;
      const idx2 = (i + 1) * 3;
      const p1 = new Point3(this.controlPoints[idx1], this.controlPoints[idx1 + 1], this.controlPoints[idx1 + 2]);
      const p2 = new Point3(this.controlPoints[idx2], this.controlPoints[idx2 + 1], this.controlPoints[idx2 + 2]);

      const segmentLength = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2) + Math.pow(p2.z - p1.z, 2));
      if (segmentLength === 0) continue;

      const t = Math.max(
        0,
        Math.min(
          1,
          ((point.x - p1.x) * (p2.x - p1.x) + (point.y - p1.y) * (p2.y - p1.y) + (point.z - p1.z) * (p2.z - p1.z)) /
          (segmentLength * segmentLength)
        )
      );

      const closest = new Point3(p1.x + t * (p2.x - p1.x), p1.y + t * (p2.y - p1.y), p1.z + t * (p2.z - p1.z));

      const distance = Math.sqrt(
        Math.pow(point.x - closest.x, 2) + Math.pow(point.y - closest.y, 2) + Math.pow(point.z - closest.z, 2)
      );

      if (distance < minDistance) {
        minDistance = distance;
        closestPoint = closest;
        closestT = (i + t) / (pointCount - 1);
      }
    }

    return { distance: minDistance, closestPoint, parameter: closestT };
  }

  public getLength(tStart: number, tEnd: number): number {
    const pointCount = this.controlPoints.length / 3;
    if (pointCount < 2) return 0;

    const startIdx = Math.floor(Math.max(0, Math.min(1, tStart)) * (pointCount - 1));
    const endIdx = Math.floor(Math.max(0, Math.min(1, tEnd)) * (pointCount - 1));

    let length = 0;
    for (let i = startIdx; i < endIdx; i++) {
      const idx1 = i * 3;
      const idx2 = (i + 1) * 3;
      const dx = this.controlPoints[idx2] - this.controlPoints[idx1];
      const dy = this.controlPoints[idx2 + 1] - this.controlPoints[idx1 + 1];
      const dz = this.controlPoints[idx2 + 2] - this.controlPoints[idx1 + 2];
      length += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    return length;
  }

  public getArea(): number {
    return 0; // 轨迹是开放的，没有面积
  }

  public getCentroid(): Point3 {
    const pointCount = this.controlPoints.length / 3;
    if (pointCount === 0) return new Point3(0, 0, 0);

    let sumX = 0,
      sumY = 0,
      sumZ = 0;
    for (let i = 0; i < pointCount; i++) {
      const idx = i * 3;
      sumX += this.controlPoints[idx];
      sumY += this.controlPoints[idx + 1];
      sumZ += this.controlPoints[idx + 2];
    }

    return new Point3(sumX / pointCount, sumY / pointCount, sumZ / pointCount);
  }

  public transform(matrix: Matrix4): Graph {
    for (let i = 0; i < this.controlPoints.length; i += 3) {
      const point = new Point3(this.controlPoints[i], this.controlPoints[i + 1], this.controlPoints[i + 2]);
      const transformed = matrix.multiply(point);
      this.controlPoints[i] = transformed.x;
      this.controlPoints[i + 1] = transformed.y;
      this.controlPoints[i + 2] = transformed.z;
    }
    this.bounds = this.updateBounds()
    return this;
  }

  /**
   * 计算与另一个图形的相交点
   * @param other 另一个图形
   * @returns 相交点数组（暂未实现）
   */
  public intersect(other: Graph): Point3[] {
    const points = []
    for (let i = 0; i < this.controlPoints.length; i += 3) {
      points.push(new Point3(this.controlPoints[i], this.controlPoints[i + 1], this.controlPoints[i + 2]))
    }
    const lines: Line[] = []
    points.reduce((prePoint, curPoint) => {
      lines.push(new Line(prePoint, curPoint))
      return curPoint
    })
    return lines.map(line => line.intersect(other)).flat()
  }
  public resize(fixedPoint: Point3, dynamicPoint: Point3, resizeVector: Vector3): void {
    const width = Math.abs(fixedPoint.x - dynamicPoint.x) || Infinity;
    const height = Math.abs(fixedPoint.y - dynamicPoint.y) || Infinity;

    for (let i = 0; i < this.controlPoints.length; i += 3) {
      // 变化比例
      const scaleX = Math.abs(this.controlPoints[i] - fixedPoint.x) / width;
      const scaleY = Math.abs(this.controlPoints[i + 1] - fixedPoint.y) / height;

      // 带方向并且按照介质尺寸缩放的移动量
      const dx = resizeVector.x * scaleX;
      const dy = resizeVector.y * scaleY;

      this.controlPoints[i] += dx
      this.controlPoints[i + 1] += dy
    }
    const referenceVector = dynamicPoint.subtract(fixedPoint)
    this.updateBounds(referenceVector.x - resizeVector.x > 0, referenceVector.y - resizeVector.y > 0)
  }
}

// 类型守卫函数
export function isDenseTrajectory(graph: any): graph is DenseTrajectory {
  return graph !== null && graph !== undefined && graph.type === GRAPHTYPE.DENSETRAJECTORY;
}
