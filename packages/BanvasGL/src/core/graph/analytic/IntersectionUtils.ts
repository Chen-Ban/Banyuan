import { Point3, GeometryUtils } from "@/core/math";
import MathUtils from "@/core/math/MathUtils";
import { GRAPHTYPE } from "@/core/constants";
import type { IAnalyticGraph, ILine, IArc, ICircle, IQuadraticBezier, ICubicBezier } from "@/core/interfaces";

/**
 * 相交处理函数类型
 * @template T 第一个图形类型
 * @template U 第二个图形类型
 */
type IntersectionHandler<T extends IAnalyticGraph = IAnalyticGraph, U extends IAnalyticGraph = IAnalyticGraph> = (a: T, b: U) => Point3[];

/**
 * 相交管理器
 * 使用单例模式管理所有图形相交处理函数
 */
class IntersectionManager {
  private static instance: IntersectionManager;

  private handlerMap = new Map<string, IntersectionHandler>();

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
    this.register(GRAPHTYPE.LINE, GRAPHTYPE.LINE, lineLineIntersect);
    this.register(GRAPHTYPE.LINE, GRAPHTYPE.ARC, lineArcIntersect);
    this.register(GRAPHTYPE.LINE, GRAPHTYPE.CIRCLE, lineCircleIntersect);
    this.register(GRAPHTYPE.LINE, GRAPHTYPE.QUADRATIC_BEZIER, lineQuadraticBezierIntersect);
    this.register(GRAPHTYPE.LINE, GRAPHTYPE.CUBIC_BEZIER, lineCubicBezierIntersect);

    // 圆弧与其他图形的相交
    this.register(GRAPHTYPE.ARC, GRAPHTYPE.ARC, arcArcIntersect);
    this.register(GRAPHTYPE.ARC, GRAPHTYPE.CIRCLE, arcCircleIntersect);
    this.register(GRAPHTYPE.ARC, GRAPHTYPE.QUADRATIC_BEZIER, arcQuadraticBezierIntersect);
    this.register(GRAPHTYPE.ARC, GRAPHTYPE.CUBIC_BEZIER, arcCubicBezierIntersect);

    // 圆与其他图形的相交
    this.register(GRAPHTYPE.CIRCLE, GRAPHTYPE.CIRCLE, circleCircleIntersect);
    this.register(GRAPHTYPE.CIRCLE, GRAPHTYPE.QUADRATIC_BEZIER, circleQuadraticBezierIntersect);
    this.register(GRAPHTYPE.CIRCLE, GRAPHTYPE.CUBIC_BEZIER, circleCubicBezierIntersect);

    // 贝塞尔曲线之间的相交
    this.register(GRAPHTYPE.QUADRATIC_BEZIER, GRAPHTYPE.QUADRATIC_BEZIER, quadraticBezierQuadraticBezierIntersect);
    this.register(GRAPHTYPE.QUADRATIC_BEZIER, GRAPHTYPE.CUBIC_BEZIER, quadraticBezierCubicBezierIntersect);
    this.register(GRAPHTYPE.CUBIC_BEZIER, GRAPHTYPE.CUBIC_BEZIER, cubicBezierCubicBezierIntersect);
  }

  private register<A extends IAnalyticGraph, B extends IAnalyticGraph>(
    typeA: GRAPHTYPE,
    typeB: GRAPHTYPE,
    handler: IntersectionHandler<A, B>
  ): void {
    const key = this.getKey(typeA, typeB);
    this.handlerMap.set(key, handler as IntersectionHandler);

    // 自动注册反向
    if (typeA !== typeB) {
      const reverseKey = this.getKey(typeB, typeA);
      this.handlerMap.set(reverseKey, (b, a) => (handler as IntersectionHandler)(a, b));
    }
  }

  private getKey(typeA: GRAPHTYPE, typeB: GRAPHTYPE): string {
    return `${typeA}-${typeB}`;
  }

  intersect(a: IAnalyticGraph, b: IAnalyticGraph): Point3[] {
    const key = this.getKey(a.type, b.type);
    const handler = this.handlerMap.get(key);

    if (!handler) {
      console.warn(`No intersection handler for ${a.type} and ${b.type}`);
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
export function intersect(a: IAnalyticGraph, b: IAnalyticGraph): Point3[] {
  return IntersectionManager.getInstance().intersect(a, b);
}

/**
 * 批量相交检测
 * @param shapes 图形数组
 * @returns 相交结果映射，key 为图形索引对 "i-j"，value 为相交点数组
 */
export function intersectAll(shapes: IAnalyticGraph[]): Map<string, Point3[]> {
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
 * 计算直线与椭圆的交点
 * @param line 直线
 * @param center 椭圆中心
 * @param xRadius X轴半径
 * @param yRadius Y轴半径
 * @param rotation 旋转角度
 * @returns 交点数组
 */
function lineEllipseIntersect(
  line: ILine,
  center: Point3,
  xRadius: number,
  yRadius: number,
  rotation: number
): Point3[] {
  const start = line.startPoint;
  const end = line.endPoint;

  // 将直线转换到椭圆的局部坐标系
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const fx = start.x - center.x;
  const fy = start.y - center.y;

  // 应用旋转（将点转换到局部坐标系）
  const cos = Math.cos(-rotation);
  const sin = Math.sin(-rotation);
  const localFx = fx * cos - fy * sin;
  const localFy = fx * sin + fy * cos;
  const localDx = dx * cos - dy * sin;
  const localDy = dx * sin + dy * cos;

  // 在局部坐标系中，椭圆方程为 (x/a)^2 + (y/b)^2 = 1
  // 直线参数方程为: x = localFx + t * localDx, y = localFy + t * localDy
  // 代入椭圆方程得到关于 t 的二次方程
  const a = xRadius;
  const b = yRadius;
  const a_coeff = (localDx * localDx) / (a * a) + (localDy * localDy) / (b * b);
  const b_coeff = 2 * ((localFx * localDx) / (a * a) + (localFy * localDy) / (b * b));
  const c_coeff = (localFx * localFx) / (a * a) + (localFy * localFy) / (b * b) - 1;

  const discriminant = b_coeff * b_coeff - 4 * a_coeff * c_coeff;

  if (discriminant < 0 || Math.abs(a_coeff) < 1e-10) {
    return []; // 无交点
  }

  const sqrtDiscriminant = Math.sqrt(discriminant);
  const t1 = (-b_coeff - sqrtDiscriminant) / (2 * a_coeff);
  const t2 = (-b_coeff + sqrtDiscriminant) / (2 * a_coeff);

  const intersections: Point3[] = [];

  // 检查交点是否在线段上（对于线段，t应该在[0,1]范围内）
  if (t1 >= 0 && t1 <= 1) {
    const worldX = start.x + t1 * dx;
    const worldY = start.y + t1 * dy;
    intersections.push(new Point3(worldX, worldY, start.z));
  }
  if (t2 >= 0 && t2 <= 1 && !MathUtils.isEqual(t1, t2)) {
    const worldX = start.x + t2 * dx;
    const worldY = start.y + t2 * dy;
    intersections.push(new Point3(worldX, worldY, start.z));
  }

  return intersections;
}

/**
 * 检查点是否在椭圆弧范围内
 * @param point 点
 * @param arc 椭圆弧
 * @returns 是否在范围内
 */
function isPointInEllipseArcRange(point: Point3, arc: IArc): boolean {
  // 将点转换到椭圆的局部坐标系
  const dx = point.x - arc.center.x;
  const dy = point.y - arc.center.y;
  const cos = Math.cos(-arc.rotation);
  const sin = Math.sin(-arc.rotation);
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;

  // 计算点在局部坐标系中的角度
  const angle = Math.atan2(localY / arc.yRadius, localX / arc.xRadius);

  // 检查角度是否在弧范围内
  return MathUtils.isAngleInArcRange(angle, arc.startAngle, arc.endAngle, arc.clockwise);
}

/**
 * 使用数值方法计算曲线与图形的相交点
 */
function numericalIntersection(
  curve: IAnalyticGraph,
  other: IAnalyticGraph,
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
function lineLineIntersect(a: ILine, b: ILine): Point3[] {
  const intersection = GeometryUtils.lineSegmentIntersection(a.startPoint, a.endPoint, b.startPoint, b.endPoint);
  return intersection ? [intersection] : [];
}

/**
 * 线-椭圆弧相交
 */
function lineArcIntersect(a: ILine, b: IArc): Point3[] {
  // 计算直线与完整椭圆的交点
  const ellipseIntersections = lineEllipseIntersect(
    a,
    b.center,
    b.xRadius,
    b.yRadius,
    b.rotation
  );

  // 过滤出在椭圆弧范围内的交点
  const arcIntersections: Point3[] = [];
  for (const point of ellipseIntersections) {
    if (isPointInEllipseArcRange(point, b)) {
      arcIntersections.push(point);
    }
  }

  return arcIntersections;
}

/**
 * 线-圆相交
 */
function lineCircleIntersect(a: ILine, b: ICircle): Point3[] {
  const start = a.startPoint;
  const end = a.endPoint;
  const center = b.center;
  const radius = b.xRadius;

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
function lineQuadraticBezierIntersect(a: ILine, b: IQuadraticBezier): Point3[] {
  // 使用数值方法
  return numericalIntersection(b, a, MathUtils.EPSILON);
}

/**
 * 线-三次贝塞尔曲线相交
 */
function lineCubicBezierIntersect(a: ILine, b: ICubicBezier): Point3[] {
  // 使用数值方法
  return numericalIntersection(b, a, MathUtils.EPSILON);
}

// ========== 圆弧与其他图形的相交 ==========

/**
 * 椭圆弧-椭圆弧相交
 */
function arcArcIntersect(a: IArc, b: IArc): Point3[] {
  // 对于椭圆与椭圆的相交，使用数值方法
  // 采样第一个椭圆弧上的点，检查是否在第二个椭圆弧上
  const intersections: Point3[] = [];
  const numSamples = 200;
  const tolerance = MathUtils.EPSILON * 10;

  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples;
    const point = a.getPointAt(t);
    const { distance } = b.getClosestPoint(point);

    if (distance < tolerance) {
      // 检查是否在第二个弧的范围内
      if (isPointInEllipseArcRange(point, b)) {
        // 去重
        const isDuplicate = intersections.some(
          (existing) => existing.distance(point) < tolerance
        );
        if (!isDuplicate) {
          intersections.push(point);
        }
      }
    }
  }

  return intersections;
}

/**
 * 椭圆弧-圆相交
 */
function arcCircleIntersect(a: IArc, b: ICircle): Point3[] {
  // 对于椭圆弧与圆的相交，使用数值方法
  // 采样椭圆弧上的点，检查是否在圆上
  const intersections: Point3[] = [];
  const numSamples = 200;
  const tolerance = MathUtils.EPSILON * 10;
  const circleRadius = (b.xRadius + b.yRadius) / 2;

  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples;
    const point = a.getPointAt(t);
    const distanceToCircleCenter = point.distance(b.center);

    if (Math.abs(distanceToCircleCenter - circleRadius) < tolerance) {
      // 检查是否在椭圆弧的范围内
      if (isPointInEllipseArcRange(point, a)) {
        // 去重
        const isDuplicate = intersections.some(
          (existing) => existing.distance(point) < tolerance
        );
        if (!isDuplicate) {
          intersections.push(point);
        }
      }
    }
  }

  return intersections;
}

/**
 * 圆弧-二次贝塞尔曲线相交
 */
function arcQuadraticBezierIntersect(a: IArc, b: IQuadraticBezier): Point3[] {
  // 使用数值方法
  return numericalIntersection(b, a, MathUtils.EPSILON);
}

/**
 * 圆弧-三次贝塞尔曲线相交
 */
function arcCubicBezierIntersect(a: IArc, b: ICubicBezier): Point3[] {
  // 使用数值方法
  return numericalIntersection(b, a, MathUtils.EPSILON);
}

// ========== 圆与其他图形的相交 ==========

/**
 * 圆-圆相交
 */
function circleCircleIntersect(a: ICircle, b: ICircle): Point3[] {
  const center1 = a.center;
  const radius1 = a.xRadius;
  const center2 = b.center;
  const radius2 = b.xRadius;

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
function circleQuadraticBezierIntersect(a: ICircle, b: IQuadraticBezier): Point3[] {
  // 使用数值方法
  return numericalIntersection(b, a, MathUtils.EPSILON);
}

/**
 * 圆-三次贝塞尔曲线相交
 */
function circleCubicBezierIntersect(a: ICircle, b: ICubicBezier): Point3[] {
  // 使用数值方法
  return numericalIntersection(b, a, MathUtils.EPSILON);
}

// ========== 贝塞尔曲线之间的相交 ==========

/**
 * 二次贝塞尔曲线-二次贝塞尔曲线相交
 */
function quadraticBezierQuadraticBezierIntersect(a: IQuadraticBezier, b: IQuadraticBezier): Point3[] {
  // 使用数值方法
  return numericalIntersection(a, b, MathUtils.EPSILON);
}

/**
 * 二次贝塞尔曲线-三次贝塞尔曲线相交
 */
function quadraticBezierCubicBezierIntersect(a: IQuadraticBezier, b: ICubicBezier): Point3[] {
  // 使用数值方法
  return numericalIntersection(a, b, MathUtils.EPSILON);
}

/**
 * 三次贝塞尔曲线-三次贝塞尔曲线相交
 */
function cubicBezierCubicBezierIntersect(a: ICubicBezier, b: ICubicBezier): Point3[] {
  // 使用数值方法
  return numericalIntersection(a, b, MathUtils.EPSILON);
}
