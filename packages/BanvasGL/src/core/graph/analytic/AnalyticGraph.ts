import { GRAPHTYPE } from "@/core/constants";
import Graph from "../base/Graph";
import { Point3, Vector3, Matrix4 } from "@/core/math";

/**
 * 解析式图形基类
 * 提供基于数学解析式的精确计算功能
 */
export default abstract class AnalyticGraph extends Graph {
  public type: GRAPHTYPE = GRAPHTYPE.ANALYTICGRAPH;

  /**
   * 获取图形上指定参数t处的点
   * @param t 参数值，通常在[0,1]范围内
   * @returns 参数t对应的点
   */
  public abstract getPointAt(t: number): Point3;

  /**
   * 获取图形上指定参数t处的切线向量
   * @param t 参数值
   * @returns 切线向量
   */
  public abstract getTangentAt(t: number): Vector3;

  /**
   * 获取图形上指定参数t处的法向量
   * @param t 参数值
   * @returns 法向量
   */
  public abstract getNormalAt(t: number): Vector3;

  /**
   * 计算点到图形的最短距离，并返回最近点
   * @param point 目标点
   * @returns {distance: number, closestPoint: Point3, parameter: number}
   */
  public abstract getClosestPoint(point: Point3): {
    distance: number;
    closestPoint: Point3;
    parameter: number;
  };

  /**
   * 计算图形与另一条解析式图形的交点
   * @param other 另一条解析式图形
   * @returns 交点数组
   */
  public abstract getIntersections(other: AnalyticGraph): Point3[];

  /**
   * 计算图形在指定参数范围内的长度
   * @param tStart 起始参数
   * @param tEnd 结束参数
   * @returns 弧长
   */
  public abstract getLength(tStart: number, tEnd: number): number;

  /**
   * 计算图形的总长度
   * @returns 总长度
   */
  public getTotalLength(): number {
    return this.getLength(0, 1);
  }

  /**
   * 检查点是否在图形上（考虑容差）
   * @param point 目标点
   * @param tolerance 容差
   * @returns 是否在图形上
   */
  public isPointOnCurve(point: Point3, tolerance: number = 1e-6): boolean {
    const { distance, closestPoint } = this.getClosestPoint(point);
    // console.log(`目标点:${point.x},${point.y}; 最近点:${closestPoint.x},${closestPoint.y},距离:${distance}`);

    return distance <= tolerance;
  }

  /**
   * 计算图形的面积（对于封闭图形）
   * @returns 面积
   */
  public abstract getArea(): number;

  /**
   * 计算图形的质心
   * @returns 质心点
   */
  public abstract getCentroid(): Point3;

  /**
   * 应用变换矩阵到图形
   * @param matrix 变换矩阵
   * @returns 变换后的图形
   */
  public abstract transform(matrix: Matrix4): AnalyticGraph;
}
