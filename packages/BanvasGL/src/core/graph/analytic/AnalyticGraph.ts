import { GRAPHTYPE } from "@/core/constants";
import Graph from "../base/Graph";
import { Point3 } from "@/core/math";
import { intersect } from "./IntersectionUtils";

/**
 * 解析式图形基类
 * 提供基于数学解析式的精确计算功能
 */
export default abstract class AnalyticGraph extends Graph {
  public type: GRAPHTYPE = GRAPHTYPE.ANALYTICGRAPH;

  /**
   * 计算与另一个图形的相交点
   * @param other 另一个图形
   * @returns 相交点数组
   */
  public intersect(other: Graph): Point3[] {
    // 如果另一个图形也是可分析图形，使用精确的相交计算方法
    if (other instanceof AnalyticGraph) {
      return intersect(this, other);
    }
    // 对于其他类型的图形，使用其他图形的相交计算方法
    return other.intersect(this);
  }
}
