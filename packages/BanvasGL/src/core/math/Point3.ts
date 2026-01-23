import MathUtils from "./MathUtils";
import Vector3 from "./Vector3";

export default class Point3 {
  private transform: Float32Array;
  constructor(x: number, y: number, z: number) {
    this.transform = new Float32Array(3);
    this.transform[0] = x;
    this.transform[1] = y;
    this.transform[2] = z;
  }
  get x(): number {
    return this.transform[0];
  }
  get y(): number {
    return this.transform[1];
  }
  get z(): number {
    return this.transform[2];
  }
  static get orgin(){
    return new Point3(0,0,0)
  }
  add(v: Vector3): Point3 {
    this.transform[0] += v.x;
    this.transform[1] += v.y;
    this.transform[2] += v.z;
    return this;
  }
  subtract(p: Point3): Vector3 {
    return new Vector3(this.x - p.x, this.y - p.y, this.z - p.z);
  }
  copy(): Point3 {
    return new Point3(this.x, this.y, this.z);
  }
  toString(): string {
    return `(${this.x},${this.y})`;
  }
  distance(p: Point3): number {
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const dz = p.z - this.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }  
  isSame(p: Point3): boolean {
    return MathUtils.isEqual(this.x, p.x) && MathUtils.isEqual(this.y, p.y) && MathUtils.isEqual(this.z, p.z);
  }
  public static midpoint(p1: Point3, p2: Point3): Point3 {
    return new Point3(
      (p1.x + p2.x) / 2,
      (p1.y + p2.y) / 2,
      (p1.z + p2.z) / 2
    );
  }
  /**
  * 计算点到直线的距离
  */
 public static distancePointToLine(point: Point3, lineStart: Point3, lineEnd: Point3): number {
   const lineVector = lineEnd.subtract(lineStart);
   const pointVector = point.subtract(lineStart);

   const lineLengthSquared = lineVector.dot(lineVector);
   if (MathUtils.isZero(lineLengthSquared)) {
     return point.distance(lineStart);
   }

   const t = pointVector.dot(lineVector) / lineLengthSquared;
   const projection = new Point3(
     lineStart.x + t * lineVector.x,
     lineStart.y + t * lineVector.y,
     lineStart.z + t * lineVector.z
   );

   return point.distance(projection);
 }

 /**
  * 计算点到线段的距离
  */
 public static distancePointToLineSegment(
   point: Point3,
   lineStart: Point3,
   lineEnd: Point3,
   restraint: boolean = true
 ): number {
   const lineVector = lineEnd.subtract(lineStart);
   const pointVector = point.subtract(lineStart);

   const lineLengthSquared = lineVector.dot(lineVector);
   if (MathUtils.isZero(lineLengthSquared)) {
     return point.distance(lineStart);
   }
   let t = pointVector.dot(lineVector) / lineLengthSquared;
   if (restraint) {
     t = Math.max(0, Math.min(1, t));
   }
   if (t < 0 || t > 1) return Infinity;
   const projection = new Point3(
     lineStart.x + t * lineVector.x,
     lineStart.y + t * lineVector.y,
     lineStart.z + t * lineVector.z
   );

   return point.distance(projection);
 }

 /**
  * 计算两条直线的交点
  */
 public static lineIntersection(
   line1Start: Point3,
   line1End: Point3,
   line2Start: Point3,
   line2End: Point3
 ): Point3 | null {
   const d1 = line1End.subtract(line1Start);
   const d2 = line2End.subtract(line2Start);
   const w = line1Start.subtract(line2Start);

   const d1d2 = d1.dot(d2);
   const d1d1 = d1.dot(d1);
   const d2d2 = d2.dot(d2);
   const wd1 = w.dot(d1);
   const wd2 = w.dot(d2);

   const denominator = d1d1 * d2d2 - d1d2 * d1d2;
   if (MathUtils.isZero(denominator)) {
     return null; // 平行线
   }

   const t1 = (d1d2 * wd2 - d2d2 * wd1) / denominator;
   const t2 = (d1d1 * wd2 - d1d2 * wd1) / denominator;

   return new Point3(line1Start.x + t1 * d1.x, line1Start.y + t1 * d1.y, line1Start.z + t1 * d1.z);
 }

 /**
  * 计算两条线段的交点
  * 利用 lineIntersection 的计算逻辑，但检查交点是否在两个线段上
  */
 public static lineSegmentIntersection(
   seg1Start: Point3,
   seg1End: Point3,
   seg2Start: Point3,
   seg2End: Point3
 ): Point3 | null {
   const d1 = seg1End.subtract(seg1Start);
   const d2 = seg2End.subtract(seg2Start);
   const w = seg1Start.subtract(seg2Start);

   const d1d2 = d1.dot(d2);
   const d1d1 = d1.dot(d1);
   const d2d2 = d2.dot(d2);
   const wd1 = w.dot(d1);
   const wd2 = w.dot(d2);

   const denominator = d1d1 * d2d2 - d1d2 * d1d2;
   if (MathUtils.isZero(denominator)) {
     return null; // 平行线
   }

   const t1 = (d1d2 * wd2 - d2d2 * wd1) / denominator;
   const t2 = (d1d1 * wd2 - d1d2 * wd1) / denominator;

   // 检查交点是否在两个线段上（参数 t1 和 t2 必须在 [0, 1] 范围内）
   if (t1 >= 0 && t1 <= 1 && t2 >= 0 && t2 <= 1) {
     return new Point3(seg1Start.x + t1 * d1.x, seg1Start.y + t1 * d1.y, seg1Start.z + t1 * d1.z);
   }

   return null; // 交点不在线段上
 }
}
