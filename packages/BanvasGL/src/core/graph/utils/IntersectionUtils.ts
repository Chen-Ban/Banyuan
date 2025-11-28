import Graph from "../base/Graph";
import { Point3 } from "@/core/math";
import { MathUtils } from "@/core/math/MathUtils";
import { isLine, isCircle, isArc, isQuadraticBezier, isCubicBezier, isAnalyticGraph, isRectangle } from "./typeGuards";
import Line from "../analytic/Line";
import Circle from "../analytic/Circle";
import type Arc from "../analytic/Arc";
import type QuadraticBezier from "../analytic/QuadraticBezier";
import type CubicBezier from "../analytic/CubicBezier";
import type Rectangle from "../combined/Polygon/Rectangle";

/**
 * 相交工具类
 * 提供各种图形之间的相交点计算功能
 */
export class IntersectionUtils {
  /**
   * 容差值，用于判断点是否在图形上
   */
  public static readonly TOLERANCE = 1e-3;

  /**
   * 固定步长（像素），用于采样计算相交点
   */
  public static readonly STEP_SIZE = .1;

  /**
   * 计算两个图形之间的相交点
   * @param graph1 第一个图形
   * @param graph2 第二个图形
   * @param tolerance 容差值，默认为 TOLERANCE
   * @returns 相交点数组
   */
  public static getIntersections(
    graph1: Graph,
    graph2: Graph,
    tolerance: number = IntersectionUtils.TOLERANCE
  ): Point3[] {
    // 如果两个图形都是解析式图形，使用精确方法
    if (isAnalyticGraph(graph1) && isAnalyticGraph(graph2)) {
      return IntersectionUtils.getAnalyticIntersections(graph1, graph2, tolerance);
    }

    // 如果其中一个是矩形，使用矩形相交方法
    if (isRectangle(graph1)) {
      return IntersectionUtils.getRectangleIntersections(graph1, graph2, tolerance);
    }
    if (isRectangle(graph2)) {
      return IntersectionUtils.getRectangleIntersections(graph2, graph1, tolerance);
    }

    // 对于其他情况，使用通用数值方法
    return IntersectionUtils.getNumericalIntersections(graph1, graph2, tolerance);
  }

  /**
   * 计算两个解析式图形之间的相交点
   */
  private static getAnalyticIntersections(
    graph1: Line | Circle | Arc | QuadraticBezier | CubicBezier,
    graph2: Line | Circle | Arc | QuadraticBezier | CubicBezier,
    tolerance: number
  ): Point3[] {
    // 线-线相交
    if (isLine(graph1) && isLine(graph2)) {
      return IntersectionUtils.lineLineIntersection(graph1, graph2);
    }

    // 线-圆相交
    if (isLine(graph1) && isCircle(graph2)) {
      return IntersectionUtils.lineCircleIntersection(graph1, graph2);
    }
    if (isCircle(graph1) && isLine(graph2)) {
      return IntersectionUtils.lineCircleIntersection(graph2, graph1);
    }

    // 线-圆弧相交
    if (isLine(graph1) && isArc(graph2)) {
      return IntersectionUtils.lineArcIntersection(graph1, graph2);
    }
    if (isArc(graph1) && isLine(graph2)) {
      return IntersectionUtils.lineArcIntersection(graph2, graph1);
    }

    // 圆-圆相交
    if (isCircle(graph1) && isCircle(graph2)) {
      return IntersectionUtils.circleCircleIntersection(graph1, graph2);
    }

    // 圆-圆弧相交
    if (isCircle(graph1) && isArc(graph2)) {
      return IntersectionUtils.circleArcIntersection(graph1, graph2);
    }
    if (isArc(graph1) && isCircle(graph2)) {
      return IntersectionUtils.circleArcIntersection(graph2, graph1);
    }

    // 圆弧-圆弧相交
    if (isArc(graph1) && isArc(graph2)) {
      return IntersectionUtils.arcArcIntersection(graph1, graph2);
    }

    // 贝塞尔曲线与其他图形的相交（使用数值方法）
    if (isQuadraticBezier(graph1) || isCubicBezier(graph1)) {
      return IntersectionUtils.bezierAnalyticIntersection(graph1, graph2, tolerance);
    }
    if (isQuadraticBezier(graph2) || isCubicBezier(graph2)) {
      return IntersectionUtils.bezierAnalyticIntersection(graph2, graph1, tolerance);
    }

    // 其他情况使用数值方法
    return IntersectionUtils.getNumericalIntersections(graph1, graph2, tolerance);
  }

  /**
   * 计算两条直线的相交点
   */
  private static lineLineIntersection(line1: Line, line2: Line): Point3[] {
    const intersection = MathUtils.lineSegmentIntersection(
      line1.startPoint,
      line1.endPoint,
      line2.startPoint,
      line2.endPoint
    );
    return intersection ? [intersection] : [];
  }

  /**
   * 计算直线与圆的相交点
   */
  private static lineCircleIntersection(line: Line, circle: Circle): Point3[] {
    const start = line.startPoint;
    const end = line.endPoint;
    const center = circle.center;
    const radius = circle.radius;

    // 将直线转换为参数方程：P = start + t * (end - start)
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const fx = start.x - center.x;
    const fy = start.y - center.y;

    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - radius * radius;

    const discriminant = b * b - 4 * a * c;

    if (discriminant < 0) {
      return []; // 无交点
    }

    const sqrtDiscriminant = Math.sqrt(discriminant);
    const t1 = (-b - sqrtDiscriminant) / (2 * a);
    const t2 = (-b + sqrtDiscriminant) / (2 * a);

    const intersections: Point3[] = [];

    // 检查交点是否在线段上（对于线段，t应该在[0,1]范围内）
    // 这里我们返回所有交点，让调用者决定是否需要限制在线段上
    if (t1 >= 0 && t1 <= 1) {
      intersections.push(new Point3(start.x + t1 * dx, start.y + t1 * dy, start.z));
    }
    if (t2 >= 0 && t2 <= 1 && !MathUtils.isEqual(t1, t2)) {
      intersections.push(new Point3(start.x + t2 * dx, start.y + t2 * dy, start.z));
    }

    return intersections;
  }

  /**
   * 计算直线与圆弧的相交点
   */
  private static lineArcIntersection(line: Line, arc: Arc): Point3[] {
    // 先计算直线与完整圆的交点
    const circle = new Circle(arc.center, arc.radius, arc.style);
    const circleIntersections = IntersectionUtils.lineCircleIntersection(line, circle);

    // 过滤出在圆弧范围内的交点
    const arcIntersections: Point3[] = [];
    for (const point of circleIntersections) {
      const angle = Math.atan2(point.y - arc.center.y, point.x - arc.center.x);
      const normalizedAngle = MathUtils.normalizeAngle(angle);
      if (IntersectionUtils.isAngleInArcRange(normalizedAngle, arc.startAngle, arc.endAngle, arc.clockwise)) {
        arcIntersections.push(point);
      }
    }

    return arcIntersections;
  }

  /**
   * 计算两个圆的相交点
   */
  private static circleCircleIntersection(circle1: Circle, circle2: Circle): Point3[] {
    return MathUtils.circleIntersection(circle1.center, circle1.radius, circle2.center, circle2.radius);
  }

  /**
   * 计算圆与圆弧的相交点
   */
  private static circleArcIntersection(circle: Circle, arc: Arc): Point3[] {
    // 先计算两个完整圆的交点
    const arcCircle = new Circle(arc.center, arc.radius, arc.style);
    const circleIntersections = IntersectionUtils.circleCircleIntersection(circle, arcCircle);

    // 过滤出在圆弧范围内的交点
    const arcIntersections: Point3[] = [];
    for (const point of circleIntersections) {
      const angle = Math.atan2(point.y - arc.center.y, point.x - arc.center.x);
      const normalizedAngle = MathUtils.normalizeAngle(angle);
      if (IntersectionUtils.isAngleInArcRange(normalizedAngle, arc.startAngle, arc.endAngle, arc.clockwise)) {
        arcIntersections.push(point);
      }
    }

    return arcIntersections;
  }

  /**
   * 计算两个圆弧的相交点
   */
  private static arcArcIntersection(arc1: Arc, arc2: Arc): Point3[] {
    // 先计算两个完整圆的交点
    const circle1 = new Circle(arc1.center, arc1.radius, arc1.style);
    const circle2 = new Circle(arc2.center, arc2.radius, arc2.style);
    const circleIntersections = IntersectionUtils.circleCircleIntersection(circle1, circle2);

    // 过滤出在两个圆弧范围内的交点
    const arcIntersections: Point3[] = [];
    for (const point of circleIntersections) {
      const angle1 = Math.atan2(point.y - arc1.center.y, point.x - arc1.center.x);
      const angle2 = Math.atan2(point.y - arc2.center.y, point.x - arc2.center.x);
      const normalizedAngle1 = MathUtils.normalizeAngle(angle1);
      const normalizedAngle2 = MathUtils.normalizeAngle(angle2);

      if (
        IntersectionUtils.isAngleInArcRange(normalizedAngle1, arc1.startAngle, arc1.endAngle, arc1.clockwise) &&
        IntersectionUtils.isAngleInArcRange(normalizedAngle2, arc2.startAngle, arc2.endAngle, arc2.clockwise)
      ) {
        arcIntersections.push(point);
      }
    }

    return arcIntersections;
  }

  /**
   * 计算贝塞尔曲线与解析式图形的相交点
   */
  private static bezierAnalyticIntersection(
    bezier: QuadraticBezier | CubicBezier,
    other: Line | Circle | Arc | QuadraticBezier | CubicBezier,
    tolerance: number
  ): Point3[] {
    const intersections: Point3[] = [];
    
    // 计算总长度
    const totalLength = bezier.getTotalLength();
    if (totalLength <= 0) {
      return intersections;
    }

    // 根据固定步长计算采样点数量
    const stepSize = IntersectionUtils.STEP_SIZE;
    const numSamples = Math.max(2, Math.ceil(totalLength / stepSize) + 1);

    // 使用固定步长采样（直接使用参数 t 的均匀分布）
    for (let i = 0; i < numSamples; i++) {
      const t = i / (numSamples - 1);
      const point = bezier.getPointAt(t);
      const { distance } = other.getClosestPoint(point);

      if (distance < tolerance) {
        // 去重：检查是否已经存在相近的交点
        const isDuplicate = intersections.some((existing) => MathUtils.distance(existing, point) < tolerance);
        if (!isDuplicate) {
          intersections.push(point);
        }
      }
    }

    return intersections;
  }

  /**
   * 计算矩形与其他图形的相交点
   */
  private static getRectangleIntersections(rectangle: Rectangle, other: Graph, tolerance: number): Point3[] {
    const intersections: Point3[] = [];

    // 直接使用矩形 graphs 数组中的 Line 对象
    for (const graph of rectangle.graphs) {
      if (isLine(graph)) {
        const edgeIntersections = IntersectionUtils.getIntersections(graph, other, tolerance);

        // 过滤出在线段上的交点（Line 本身就是线段，所以交点已经在线段上）
        for (const point of edgeIntersections) {
          // 去重
          const isDuplicate = intersections.some((existing) => MathUtils.distance(existing, point) < tolerance);
          if (!isDuplicate) {
            intersections.push(point);
          }
        }
      }
    }

    return intersections;
  }

  /**
   * 使用数值方法计算两个图形的相交点（通用方法）
   */
  private static getNumericalIntersections(graph1: Graph, graph2: Graph, tolerance: number): Point3[] {
    const intersections: Point3[] = [];
    
    // 计算第一个图形的总长度
    const totalLength = graph1.getTotalLength();
    if (totalLength <= 0) {
      return intersections;
    }

    // 根据固定步长计算采样点数量
    const stepSize = IntersectionUtils.STEP_SIZE;
    const numSamples = Math.max(2, Math.ceil(totalLength / stepSize) + 1);

    // 使用固定步长采样（直接使用参数 t 的均匀分布）
    for (let i = 0; i < numSamples; i++) {
      const t = i / (numSamples - 1);
      const point = graph1.getPointAt(t);
      const { distance } = graph2.getClosestPoint(point);

      if (distance < tolerance) {
        // 去重
        const isDuplicate = intersections.some((existing) => MathUtils.distance(existing, point) < tolerance);
        if (!isDuplicate) {
          intersections.push(point);
        }
      }
    }

    return intersections;
  }

  /**
   * 判断角度是否在圆弧范围内
   */
  private static isAngleInArcRange(angle: number, startAngle: number, endAngle: number, clockwise: boolean): boolean {
    if (clockwise) {
      // 顺时针：从 startAngle 到 endAngle（可能跨越0度）
      if (startAngle > endAngle) {
        return angle >= startAngle || angle <= endAngle;
      } else {
        return angle >= startAngle && angle <= endAngle;
      }
    } else {
      // 逆时针：从 startAngle 到 endAngle（可能跨越0度）
      if (startAngle < endAngle) {
        return angle >= startAngle && angle <= endAngle;
      } else {
        return angle >= startAngle || angle <= endAngle;
      }
    }
  }

  /**
   * 检查两个图形是否相交
   * @param graph1 第一个图形
   * @param graph2 第二个图形
   * @param tolerance 容差值
   * @returns 如果相交返回true，否则返回false
   */
  public static intersects(graph1: Graph, graph2: Graph, tolerance: number = IntersectionUtils.TOLERANCE): boolean {
    const intersections = IntersectionUtils.getIntersections(graph1, graph2, tolerance);

    return intersections.length > 0;
  }
}
