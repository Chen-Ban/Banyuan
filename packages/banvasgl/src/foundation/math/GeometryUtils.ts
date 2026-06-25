import MathUtils from './MathUtils'
import Point3 from './Point3'

/**
 * 几何工具类
 *
 * 提供常用的几何计算方法，包括中点计算、点线距离、直线与线段交点求解等。
 */
export default class GeometryUtils {
  /**
   * 计算投影参数
   *
   * 计算点在直线上的投影参数 t，其中 t = 0 对应 lineStart，t = 1 对应 lineEnd。
   * 该参数可用于判断投影点在直线上的相对位置。
   *
   * @param point - 待投影的点
   * @param lineStart - 线段/直线起点
   * @param lineEnd - 线段/直线终点
   * @returns t 值；若线段退化（起点与终点重合）则返回 null
   *
   * @example
   * ```ts
   * const t = GeometryUtils['projectT'](
   *   new Point3(1, 2, 0),
   *   new Point3(0, 0, 0),
   *   new Point3(2, 0, 0)
   * ); // 0.5
   * ```
   */
  public static projectT(point: Point3, lineStart: Point3, lineEnd: Point3): number | null {
    const lineVector = lineEnd.subtract(lineStart)
    const pointVector = point.subtract(lineStart)
    const lineLengthSquared = lineVector.dot(lineVector)
    if (MathUtils.isZero(lineLengthSquared)) {
      return null
    }
    return pointVector.dot(lineVector) / lineLengthSquared
  }

  /**
   * 计算两点中点
   *
   * 返回两个三维点的中点坐标，即各分量取平均值。
   *
   * @param p1 - 第一个点
   * @param p2 - 第二个点
   * @returns 两点的中点
   *
   * @example
   * ```ts
   * const mid = GeometryUtils.midpoint(
   *   new Point3(0, 0, 0),
   *   new Point3(4, 6, 2)
   * ); // Point3(2, 3, 1)
   * ```
   */
  public static midpoint(p1: Point3, p2: Point3): Point3 {
    return new Point3((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, (p1.z + p2.z) / 2)
  }

  /**
   * 计算点到直线的垂直距离
   *
   * 将点向直线做垂线投影，返回点与投影点之间的距离。
   * 若直线退化（两端点重合），退化为点到点的距离。
   *
   * @param point - 目标点
   * @param lineStart - 直线上的一点（起点）
   * @param lineEnd - 直线上的另一点（终点）
   * @returns 点到直线的垂直距离
   *
   * @example
   * ```ts
   * const dist = GeometryUtils.perpendicularDistance(
   *   new Point3(1, 1, 0),
   *   new Point3(0, 0, 0),
   *   new Point3(2, 0, 0)
   * ); // 1（点 (1,1) 到 x 轴的距离）
   * ```
   */
  public static perpendicularDistance(point: Point3, lineStart: Point3, lineEnd: Point3): number {
    const t = GeometryUtils.projectT(point, lineStart, lineEnd)
    if (t === null) {
      return point.distance(lineStart)
    }

    const lineVector = lineEnd.subtract(lineStart)
    const projection = new Point3(
      lineStart.x + t * lineVector.x,
      lineStart.y + t * lineVector.y,
      lineStart.z + t * lineVector.z,
    )

    return point.distance(projection)
  }

  /**
   * 判断投影是否落在线段内
   *
   * 判断点在线段上的投影是否落在线段内（即投影参数 t ∈ [0, 1]）。
   * 若线段退化（起点与终点重合），返回 false。
   *
   * @param point - 待投影的点
   * @param lineStart - 线段起点
   * @param lineEnd - 线段终点
   * @returns 投影落在线段内返回 true，否则返回 false
   *
   * @example
   * ```ts
   * GeometryUtils.isProjectionOnSegment(
   *   new Point3(1, 5, 0),
   *   new Point3(0, 0, 0),
   *   new Point3(2, 0, 0)
   * ); // true（投影点 (1,0) 在线段内）
   *
   * GeometryUtils.isProjectionOnSegment(
   *   new Point3(3, 1, 0),
   *   new Point3(0, 0, 0),
   *   new Point3(2, 0, 0)
   * ); // false（投影点超出线段范围）
   * ```
   */
  public static isProjectionOnSegment(point: Point3, lineStart: Point3, lineEnd: Point3): boolean {
    const t = GeometryUtils.projectT(point, lineStart, lineEnd)
    if (t === null) {
      return false
    }
    return t >= 0 && t <= 1
  }

  /**
   * 计算两条直线的交点
   *
   * 通过参数化方程求解两条直线在三维空间中的交点。
   * 若两直线平行（行列式为零），返回 null。
   *
   * @param line1Start - 第一条直线的起点
   * @param line1End - 第一条直线的终点
   * @param line2Start - 第二条直线的起点
   * @param line2End - 第二条直线的终点
   * @returns 两条直线的交点；若平行则返回 null
   *
   * @example
   * ```ts
   * const intersection = GeometryUtils.lineIntersection(
   *   new Point3(0, 0, 0), new Point3(2, 2, 0),  // y = x
   *   new Point3(0, 2, 0), new Point3(2, 0, 0)   // y = -x + 2
   * ); // Point3(1, 1, 0)
   * ```
   */
  public static lineIntersection(
    line1Start: Point3,
    line1End: Point3,
    line2Start: Point3,
    line2End: Point3,
  ): Point3 | null {
    const d1 = line1End.subtract(line1Start)
    const d2 = line2End.subtract(line2Start)
    const w = line1Start.subtract(line2Start)

    const d1d2 = d1.dot(d2)
    const d1d1 = d1.dot(d1)
    const d2d2 = d2.dot(d2)
    const wd1 = w.dot(d1)
    const wd2 = w.dot(d2)

    const denominator = d1d1 * d2d2 - d1d2 * d1d2
    if (MathUtils.isZero(denominator)) {
      return null // 平行线
    }

    const t1 = (d1d2 * wd2 - d2d2 * wd1) / denominator

    return new Point3(line1Start.x + t1 * d1.x, line1Start.y + t1 * d1.y, line1Start.z + t1 * d1.z)
  }

  /**
   * 计算两条线段的交点
   *
   * 利用参数化方程求解两条线段的交点，并检查交点参数是否都在 [0, 1] 范围内，
   * 确保交点确实位于两条线段上。若平行或交点不在线段范围内，返回 null。
   *
   * @param seg1Start - 第一条线段的起点
   * @param seg1End - 第一条线段的终点
   * @param seg2Start - 第二条线段的起点
   * @param seg2End - 第二条线段的终点
   * @returns 两条线段的交点；若平行或交点不在线段上则返回 null
   *
   * @example
   * ```ts
   * const intersection = GeometryUtils.lineSegmentIntersection(
   *   new Point3(0, 0, 0), new Point3(2, 2, 0),
   *   new Point3(0, 2, 0), new Point3(2, 0, 0)
   * ); // Point3(1, 1, 0)
   *
   * // 线段不相交的情况
   * const noIntersection = GeometryUtils.lineSegmentIntersection(
   *   new Point3(0, 0, 0), new Point3(1, 1, 0),
   *   new Point3(2, 0, 0), new Point3(3, 1, 0)
   * ); // null
   * ```
   */
  public static lineSegmentIntersection(
    seg1Start: Point3,
    seg1End: Point3,
    seg2Start: Point3,
    seg2End: Point3,
  ): Point3 | null {
    const d1 = seg1End.subtract(seg1Start)
    const d2 = seg2End.subtract(seg2Start)
    const w = seg1Start.subtract(seg2Start)

    const d1d2 = d1.dot(d2)
    const d1d1 = d1.dot(d1)
    const d2d2 = d2.dot(d2)
    const wd1 = w.dot(d1)
    const wd2 = w.dot(d2)

    const denominator = d1d1 * d2d2 - d1d2 * d1d2
    if (MathUtils.isZero(denominator)) {
      return null // 平行线
    }

    const t1 = (d1d2 * wd2 - d2d2 * wd1) / denominator
    const t2 = (d1d1 * wd2 - d1d2 * wd1) / denominator

    // 检查交点是否在两个线段上（参数 t1 和 t2 必须在 [0, 1] 范围内）
    if (t1 >= 0 && t1 <= 1 && t2 >= 0 && t2 <= 1) {
      return new Point3(seg1Start.x + t1 * d1.x, seg1Start.y + t1 * d1.y, seg1Start.z + t1 * d1.z)
    }

    return null // 交点不在线段上
  }
}
