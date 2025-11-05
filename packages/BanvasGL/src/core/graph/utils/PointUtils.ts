import { Point3 } from "@/core/math";

/**
 * 点工具类
 * 提供各种点相关的工具函数
 */
export class PointUtils {
  /**
   * 判断两个点是否是同一点
   * @param point1 第一个点
   * @param point2 第二个点
   * @param tolerance 容差值，默认为0.001
   * @returns 如果是同一点返回true，否则返回false
   */
  public static isSamePoint(
    point1: Point3,
    point2: Point3,
    tolerance: number = 0.001
  ): boolean {
    const distance = Math.sqrt(
      Math.pow(point2.x - point1.x, 2) +
        Math.pow(point2.y - point1.y, 2) +
        Math.pow(point2.z - point1.z, 2)
    );

    return distance <= tolerance;
  }

  /**
   * 计算两点之间的距离
   * @param point1 第一个点
   * @param point2 第二个点
   * @returns 两点之间的距离
   */
  public static distance(point1: Point3, point2: Point3): number {
    return Math.sqrt(
      Math.pow(point2.x - point1.x, 2) +
        Math.pow(point2.y - point1.y, 2) +
        Math.pow(point2.z - point1.z, 2)
    );
  }

  /**
   * 获取两个点的中点
   * @param point1 第一个点
   * @param point2 第二个点
   * @returns 中点
   */
  public static midpoint(point1: Point3, point2: Point3): Point3 {
    return new Point3(
      (point1.x + point2.x) / 2,
      (point1.y + point2.y) / 2,
      (point1.z + point2.z) / 2
    );
  }

  /**
   * 判断点是否在指定范围内
   * @param point 要检查的点
   * @param center 中心点
   * @param radius 半径
   * @returns 如果在范围内返回true，否则返回false
   */
  public static isInRange(
    point: Point3,
    center: Point3,
    radius: number
  ): boolean {
    return this.distance(point, center) <= radius;
  }
}
