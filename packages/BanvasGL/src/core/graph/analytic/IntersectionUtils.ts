import { Point3 } from "@/core/math";
import MathUtils from "@/core/math/MathUtils";
import AnalyticGraph from "./AnalyticGraph";
import Line from "./Line";
import Circle from "./Circle";
import Arc from "./Arc";
import QuadraticBezier from "./QuadraticBezier";
import CubicBezier from "./CubicBezier";

/**
 * 相交处理函数类型
 * @template T 第一个图形类型
 * @template U 第二个图形类型
 */
type IntersectionHandler<T extends AnalyticGraph, U extends AnalyticGraph> = (a: T, b: U) => Point3[];

/**
 * 相交管理器
 * 使用单例模式管理所有图形相交处理函数
 */
class IntersectionManager {
  private static instance: IntersectionManager;

  private handlerMap = new Map<string, IntersectionHandler<any, any>>();

  private constructor() {
    this.registerHandlers();
  }

  static getInstance(): IntersectionManager {
    if (!IntersectionManager.instance) {
      IntersectionManager.instance = new IntersectionManager();
    }
    return IntersectionManager.instance;
  }

  private registerHandlers(): void {
    // 线与其他图形的相交
    this.register(Line, Line, lineLineIntersect);
    this.register(Line, Arc, lineArcIntersect);
    this.register(Line, Circle, lineCircleIntersect);
    this.register(Line, QuadraticBezier, lineQuadraticBezierIntersect);
    this.register(Line, CubicBezier, lineCubicBezierIntersect);

    // 圆弧与其他图形的相交
    this.register(Arc, Arc, arcArcIntersect);
    this.register(Arc, Circle, arcCircleIntersect);
    this.register(Arc, QuadraticBezier, arcQuadraticBezierIntersect);
    this.register(Arc, CubicBezier, arcCubicBezierIntersect);

    // 圆与其他图形的相交
    this.register(Circle, Circle, circleCircleIntersect);
    this.register(Circle, QuadraticBezier, circleQuadraticBezierIntersect);
    this.register(Circle, CubicBezier, circleCubicBezierIntersect);

    // 贝塞尔曲线之间的相交
    this.register(QuadraticBezier, QuadraticBezier, quadraticBezierQuadraticBezierIntersect);
    this.register(QuadraticBezier, CubicBezier, quadraticBezierCubicBezierIntersect);
    this.register(CubicBezier, CubicBezier, cubicBezierCubicBezierIntersect);
  }

  private register<T extends AnalyticGraph, U extends AnalyticGraph>(
    typeA: new (...args: any[]) => T,
    typeB: new (...args: any[]) => U,
    handler: IntersectionHandler<T, U>
  ): void {
    const key = this.getKey(typeA, typeB);
    this.handlerMap.set(key, handler);

    // 自动注册反向
    const typeAName = typeA.name;
    const typeBName = typeB.name;
    if (typeAName !== typeBName) {
      const reverseKey = this.getKey(typeB, typeA);
      this.handlerMap.set(reverseKey, (b, a) => handler(a, b));
    }
  }

  private getKey(typeA: any, typeB: any): string {
    return `${typeA.name}-${typeB.name}`;
  }

  getHandler(a: AnalyticGraph, b: AnalyticGraph): IntersectionHandler<any, any> | undefined {
    const key = this.getKey(a.constructor, b.constructor);
    return this.handlerMap.get(key);
  }

  intersect(a: AnalyticGraph, b: AnalyticGraph): Point3[] {
    const handler = this.getHandler(a, b);

    if (!handler) {
      // 降级到包围盒检测
      console.warn(`No intersection handler for ${a.constructor.name} and ${b.constructor.name}`);
      return [];
    }

    return handler(a, b);
  }
}

/**
 * 计算两个图形的相交点
 * @param a 第一个图形
 * @param b 第二个图形
 * @returns 相交点数组
 */
export function intersect(a: AnalyticGraph, b: AnalyticGraph): Point3[] {
  return IntersectionManager.getInstance().intersect(a, b);
}

/**
 * 批量相交检测
 * @param shapes 图形数组
 * @returns 相交结果映射，key 为图形索引对 "i-j"，value 为相交点数组
 */
export function intersectAll(shapes: AnalyticGraph[]): Map<string, Point3[]> {
  const results = new Map<string, Point3[]>();
  const intersectionManager = IntersectionManager.getInstance();

  for (let i = 0; i < shapes.length; i++) {
    for (let j = i + 1; j < shapes.length; j++) {
      const points = intersectionManager.intersect(shapes[i], shapes[j]);
      if (points.length > 0) {
        results.set(`${i}-${j}`, points);
      }
    }
  }

  return results;
}

// ==================== 相交处理函数 ====================

// ========== 辅助函数 ==========

/**
 * 使用数值方法计算曲线与图形的相交点
 */
function numericalIntersection(
  curve: AnalyticGraph,
  other: AnalyticGraph,
  tolerance: number = MathUtils.EPSILON
): Point3[] {
  const intersections: Point3[] = [];
  const stepSize = 0.1; // 固定步长（像素）

  // 获取曲线的总长度
  const totalLength = curve.getTotalLength();
  if (totalLength <= 0) {
    return intersections;
  }

  // 根据固定步长计算采样点数量
  const numSteps = Math.max(2, Math.ceil(totalLength / stepSize) + 1);

  // 使用固定步长采样（通过均匀分布参数 t 来近似）
  for (let i = 0; i <= numSteps; i++) {
    const t = i / numSteps;
    const point = curve.getPointAt(t);
    const { distance, closestPoint } = other.getClosestPoint(point);

    if (distance < tolerance) {
      // 去重：检查是否已经存在相近的交点
      const isDuplicate = intersections.some((existing) => existing.distance(closestPoint) < tolerance);
      if (!isDuplicate) {
        intersections.push(closestPoint);
      }
    }
  }

  return intersections;
}

// ========== 线与其他图形的相交 ==========

/**
 * 线-线相交
 */
function lineLineIntersect(a: Line, b: Line): Point3[] {
  const intersection = Point3.lineSegmentIntersection(a.startPoint, a.endPoint, b.startPoint, b.endPoint);
  return intersection ? [intersection] : [];
}

/**
 * 线-圆弧相交
 */
function lineArcIntersect(a: Line, b: Arc): Point3[] {
  // 先计算直线与完整圆的交点
  const circleIntersections = lineCircleIntersect(a, new Circle(b.center, b.radius, b.style));

  // 过滤出在圆弧范围内的交点
  const arcIntersections: Point3[] = [];
  for (const point of circleIntersections) {
    const angle = MathUtils.calculateAngle(point.x - b.center.x, point.y - b.center.y);
    if (MathUtils.isAngleInArcRange(angle, b.startAngle, b.endAngle, b.clockwise)) {
      arcIntersections.push(point);
    }
  }

  return arcIntersections;
}

/**
 * 线-圆相交
 */
function lineCircleIntersect(a: Line, b: Circle): Point3[] {
  const start = a.startPoint;
  const end = a.endPoint;
  const center = b.center;
  const radius = b.radius;

  // 将直线转换为参数方程：P = start + t * (end - start)
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const fx = start.x - center.x;
  const fy = start.y - center.y;

  const a_coeff = dx * dx + dy * dy;
  const b_coeff = 2 * (fx * dx + fy * dy);
  const c_coeff = fx * fx + fy * fy - radius * radius;

  const discriminant = b_coeff * b_coeff - 4 * a_coeff * c_coeff;

  if (discriminant < 0) {
    return []; // 无交点
  }

  const sqrtDiscriminant = Math.sqrt(discriminant);
  const t1 = (-b_coeff - sqrtDiscriminant) / (2 * a_coeff);
  const t2 = (-b_coeff + sqrtDiscriminant) / (2 * a_coeff);

  const intersections: Point3[] = [];

  // 检查交点是否在线段上（对于线段，t应该在[0,1]范围内）
  if (t1 >= 0 && t1 <= 1) {
    intersections.push(new Point3(start.x + t1 * dx, start.y + t1 * dy, start.z));
  }
  if (t2 >= 0 && t2 <= 1 && !MathUtils.isEqual(t1, t2)) {
    intersections.push(new Point3(start.x + t2 * dx, start.y + t2 * dy, start.z));
  }

  return intersections;
}

/**
 * 线-二次贝塞尔曲线相交
 */
function lineQuadraticBezierIntersect(a: Line, b: QuadraticBezier): Point3[] {
  // 使用数值方法
  return numericalIntersection(b, a, MathUtils.EPSILON);
}

/**
 * 线-三次贝塞尔曲线相交
 */
function lineCubicBezierIntersect(a: Line, b: CubicBezier): Point3[] {
  // 使用数值方法
  return numericalIntersection(b, a, MathUtils.EPSILON);
}

// ========== 圆弧与其他图形的相交 ==========

/**
 * 圆弧-圆弧相交
 */
function arcArcIntersect(a: Arc, b: Arc): Point3[] {
  // 将圆弧转换为圆，计算两个完整圆的交点
  const circleA = new Circle(a.center, a.radius, a.style);
  const circleB = new Circle(b.center, b.radius, b.style);
  const circleIntersections = circleCircleIntersect(circleA, circleB);

  // 过滤出在两个圆弧范围内的交点
  const arcIntersections: Point3[] = [];
  for (const point of circleIntersections) {
    const angle1 = MathUtils.calculateAngle(point.x - a.center.x, point.y - a.center.y);
    const angle2 = MathUtils.calculateAngle(point.x - b.center.x, point.y - b.center.y);

    if (
      MathUtils.isAngleInArcRange(angle1, a.startAngle, a.endAngle, a.clockwise) &&
      MathUtils.isAngleInArcRange(angle2, b.startAngle, b.endAngle, b.clockwise)
    ) {
      arcIntersections.push(point);
    }
  }

  return arcIntersections;
}

/**
 * 圆弧-圆相交
 */
function arcCircleIntersect(a: Arc, b: Circle): Point3[] {
  // 将圆弧转换为圆，计算两个完整圆的交点
  const circleA = new Circle(a.center, a.radius, a.style);
  const circleIntersections = circleCircleIntersect(circleA, b);

  // 过滤出在圆弧范围内的交点
  const arcIntersections: Point3[] = [];
  for (const point of circleIntersections) {
    const angle = MathUtils.calculateAngle(point.x - a.center.x, point.y - a.center.y);
    if (MathUtils.isAngleInArcRange(angle, a.startAngle, a.endAngle, a.clockwise)) {
      arcIntersections.push(point);
    }
  }

  return arcIntersections;
}

/**
 * 圆弧-二次贝塞尔曲线相交
 */
function arcQuadraticBezierIntersect(a: Arc, b: QuadraticBezier): Point3[] {
  // 使用数值方法
  return numericalIntersection(b, a, MathUtils.EPSILON);
}

/**
 * 圆弧-三次贝塞尔曲线相交
 */
function arcCubicBezierIntersect(a: Arc, b: CubicBezier): Point3[] {
  // 使用数值方法
  return numericalIntersection(b, a, MathUtils.EPSILON);
}

// ========== 圆与其他图形的相交 ==========

/**
 * 圆-圆相交
 */
function circleCircleIntersect(a: Circle, b: Circle): Point3[] {
  const center1 = a.center;
  const radius1 = a.radius;
  const center2 = b.center;
  const radius2 = b.radius;

  const dx = center2.x - center1.x;
  const dy = center2.y - center1.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // 检查是否相交
  if (distance > radius1 + radius2 || distance < Math.abs(radius1 - radius2)) {
    return []; // 不相交
  }

  // 检查是否同心
  if (MathUtils.isZero(distance)) {
    return []; // 同心圆，无交点或无限交点
  }

  // 计算交点
  const a_coeff = (radius1 * radius1 - radius2 * radius2 + distance * distance) / (2 * distance);
  const h = Math.sqrt(radius1 * radius1 - a_coeff * a_coeff);

  const px = center1.x + (a_coeff * dx) / distance;
  const py = center1.y + (a_coeff * dy) / distance;

  const intersections: Point3[] = [];

  // 如果 h 为 0，只有一个交点（相切）
  if (MathUtils.isZero(h)) {
    intersections.push(new Point3(px, py, center1.z));
  } else {
    // 两个交点
    const offsetX = (-h * dy) / distance;
    const offsetY = (h * dx) / distance;
    intersections.push(new Point3(px + offsetX, py + offsetY, center1.z));
    intersections.push(new Point3(px - offsetX, py - offsetY, center1.z));
  }

  return intersections;
}

/**
 * 圆-二次贝塞尔曲线相交
 */
function circleQuadraticBezierIntersect(a: Circle, b: QuadraticBezier): Point3[] {
  // 使用数值方法
  return numericalIntersection(b, a, MathUtils.EPSILON);
}

/**
 * 圆-三次贝塞尔曲线相交
 */
function circleCubicBezierIntersect(a: Circle, b: CubicBezier): Point3[] {
  // 使用数值方法
  return numericalIntersection(b, a, MathUtils.EPSILON);
}

// ========== 贝塞尔曲线之间的相交 ==========

/**
 * 二次贝塞尔曲线-二次贝塞尔曲线相交
 */
function quadraticBezierQuadraticBezierIntersect(a: QuadraticBezier, b: QuadraticBezier): Point3[] {
  // 使用数值方法
  return numericalIntersection(a, b, MathUtils.EPSILON);
}

/**
 * 二次贝塞尔曲线-三次贝塞尔曲线相交
 */
function quadraticBezierCubicBezierIntersect(a: QuadraticBezier, b: CubicBezier): Point3[] {
  // 使用数值方法
  return numericalIntersection(a, b, MathUtils.EPSILON);
}

/**
 * 三次贝塞尔曲线-三次贝塞尔曲线相交
 */
function cubicBezierCubicBezierIntersect(a: CubicBezier, b: CubicBezier): Point3[] {
  // 使用数值方法
  return numericalIntersection(a, b, MathUtils.EPSILON);
}
