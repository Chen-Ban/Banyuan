import { GRAPHTYPE } from "@/constants"
import Bezier from "./Bezier"
import AnalyticGraph from "./AnalyticGraph"
import { Point3, Vector3, Matrix4 } from "@/core/math"
import { Style } from "@/core/style"
import { GraphOptions } from "../base/Graph"
import Bounds from "../base/Bounds"

export default class CubicBezier extends Bezier {
    public type: GRAPHTYPE = GRAPHTYPE.CUBIC_BEZIER

    constructor(
        startPoint: Point3,
        controlPoint1: Point3,
        controlPoint2: Point3,
        endPoint: Point3,
        style: Style = Style.DEFAULT,
        options?: GraphOptions
    ) {
        super([startPoint, controlPoint1, controlPoint2, endPoint], style, options)
    }

    // 获取第一个控制点
    get controlPoint1(): Point3 {
        return this.controlPoints[1]
    }

    // 获取第二个控制点
    get controlPoint2(): Point3 {
        return this.controlPoints[2]
    }

    // 设置第一个控制点
    setControlPoint1(controlPoint1: Point3): CubicBezier {
        this.controlPoints[1] = controlPoint1
        this.invalidateBounds()
        return this
    }

    // 设置第二个控制点
    setControlPoint2(controlPoint2: Point3): CubicBezier {
        this.controlPoints[2] = controlPoint2
        this.invalidateBounds()
        return this
    }

    // 计算三次贝塞尔曲线的边界框
    protected calculateBounds(): Bounds {
        const curveBounds = this.calculateCurveBounds()
        return new Bounds(curveBounds.minX, curveBounds.minY, curveBounds.width, curveBounds.height)
    }

    // 设置指定位置的控制点（重写基类方法）
    setControlPoint(index: number, point: Point3): CubicBezier {
        if (index >= 0 && index < this.controlPoints.length) {
            this.controlPoints[index] = point
            this.invalidateBounds()
        }
        return this
    }

    // 计算三次贝塞尔曲线上的点
    public getPointAt(t: number): Point3 {
        const clampedT = Math.max(0, Math.min(1, t))
        const start = this.controlPoints[0]
        const control1 = this.controlPoints[1]
        const control2 = this.controlPoints[2]
        const end = this.controlPoints[3]

        // 三次贝塞尔曲线公式: B(t) = (1-t)³P₀ + 3(1-t)²tP₁ + 3(1-t)t²P₂ + t³P₃
        const oneMinusT = 1 - clampedT
        const oneMinusTCubed = oneMinusT * oneMinusT * oneMinusT
        const threeOneMinusTSquaredT = 3 * oneMinusT * oneMinusT * clampedT
        const threeOneMinusTTsquared = 3 * oneMinusT * clampedT * clampedT
        const tCubed = clampedT * clampedT * clampedT

        const x = oneMinusTCubed * start.x + threeOneMinusTSquaredT * control1.x + threeOneMinusTTsquared * control2.x + tCubed * end.x
        const y = oneMinusTCubed * start.y + threeOneMinusTSquaredT * control1.y + threeOneMinusTTsquared * control2.y + tCubed * end.y
        const z = oneMinusTCubed * start.z + threeOneMinusTSquaredT * control1.z + threeOneMinusTTsquared * control2.z + tCubed * end.z

        return new Point3(x, y, z)
    }

    // 计算三次贝塞尔曲线的切线方向
    public getTangentAt(t: number): Vector3 {
        const clampedT = Math.max(0, Math.min(1, t))
        const start = this.controlPoints[0]
        const control1 = this.controlPoints[1]
        const control2 = this.controlPoints[2]
        const end = this.controlPoints[3]

        // 切线公式: B'(t) = 3(1-t)²(P₁-P₀) + 6(1-t)t(P₂-P₁) + 3t²(P₃-P₂)
        const oneMinusT = 1 - clampedT
        const threeOneMinusTSquared = 3 * oneMinusT * oneMinusT
        const sixOneMinusTT = 6 * oneMinusT * clampedT
        const threeTSquared = 3 * clampedT * clampedT

        const dx = threeOneMinusTSquared * (control1.x - start.x) + sixOneMinusTT * (control2.x - control1.x) + threeTSquared * (end.x - control2.x)
        const dy = threeOneMinusTSquared * (control1.y - start.y) + sixOneMinusTT * (control2.y - control1.y) + threeTSquared * (end.y - control2.y)
        const dz = threeOneMinusTSquared * (control1.z - start.z) + sixOneMinusTT * (control2.z - control1.z) + threeTSquared * (end.z - control2.z)

        return new Vector3(dx, dy, dz)
    }

    // 计算三次贝塞尔曲线的法线方向
    public getNormalAt(t: number): Vector3 {
        const tangent = this.getTangentAt(t)
        // 法线是切线的垂直方向
        return new Vector3(-tangent.y, tangent.x, 0)
    }

    // 计算三次贝塞尔曲线的曲率
    public getCurvatureAt(t: number): number {
        return this.getCurvature(t)
    }

    // 计算三次贝塞尔曲线的曲率（AnalyticGraph 要求）
    public getCurvature(t: number): number {
        const clampedT = Math.max(0, Math.min(1, t))
        const start = this.controlPoints[0]
        const control1 = this.controlPoints[1]
        const control2 = this.controlPoints[2]
        const end = this.controlPoints[3]

        // 二阶导数
        const oneMinusT = 1 - clampedT
        const d2x = 6 * oneMinusT * (control2.x - 2 * control1.x + start.x) + 6 * clampedT * (end.x - 2 * control2.x + control1.x)
        const d2y = 6 * oneMinusT * (control2.y - 2 * control1.y + start.y) + 6 * clampedT * (end.y - 2 * control2.y + control1.y)

        // 一阶导数
        const threeOneMinusTSquared = 3 * oneMinusT * oneMinusT
        const sixOneMinusTT = 6 * oneMinusT * clampedT
        const threeTSquared = 3 * clampedT * clampedT

        const dx = threeOneMinusTSquared * (control1.x - start.x) + sixOneMinusTT * (control2.x - control1.x) + threeTSquared * (end.x - control2.x)
        const dy = threeOneMinusTSquared * (control1.y - start.y) + sixOneMinusTT * (control2.y - control1.y) + threeTSquared * (end.y - control2.y)

        // 曲率公式: κ = |x'y'' - y'x''| / (x'² + y'²)^(3/2)
        const numerator = Math.abs(dx * d2y - dy * d2x)
        const denominator = Math.pow(dx * dx + dy * dy, 1.5)

        return denominator === 0 ? 0 : numerator / denominator
    }

    // 获取三次贝塞尔曲线的长度
    public get length(): number {
        return this.calculateApproximateLength(100)
    }

    // 获取总长度（AnalyticGraph 要求）
    public getTotalLength(): number {
        return this.length
    }

    // 根据弧长参数获取点
    public getPointAtArcLength(arcLength: number): Point3 {
        const totalLength = this.length
        if (totalLength === 0) return this.startPoint

        const targetT = arcLength / totalLength
        return this.getPointAt(targetT)
    }

    // 根据弧长获取参数值（AnalyticGraph 要求）
    public getParameterFromArcLength(arcLength: number): number {
        const totalLength = this.length
        if (totalLength === 0) return 0
        return Math.max(0, Math.min(1, arcLength / totalLength))
    }

    // 计算指定参数范围内的弧长（AnalyticGraph 要求）
    public getArcLength(tStart: number, tEnd: number): number {
        const clampedStart = Math.max(0, Math.min(1, tStart))
        const clampedEnd = Math.max(0, Math.min(1, tEnd))
        
        if (clampedStart >= clampedEnd) return 0
        
        const steps = 100
        let length = 0
        let prevPoint = this.getPointAt(clampedStart)
        
        for (let i = 1; i <= steps; i++) {
            const t = clampedStart + (clampedEnd - clampedStart) * i / steps
            const currentPoint = this.getPointAt(t)
            const dx = currentPoint.x - prevPoint.x
            const dy = currentPoint.y - prevPoint.y
            length += Math.sqrt(dx * dx + dy * dy)
            prevPoint = currentPoint
        }
        
        return length
    }

    // 获取三次贝塞尔曲线的拐点
    getInflectionPoints(): Point3[] {
        const start = this.controlPoints[0]
        const control1 = this.controlPoints[1]
        const control2 = this.controlPoints[2]
        const end = this.controlPoints[3]

        // 计算拐点的t值
        // 拐点出现在二阶导数为0的地方
        const a = end.x - 3 * control2.x + 3 * control1.x - start.x
        const b = 3 * (control2.x - 2 * control1.x + start.x)
        const c = 3 * (control1.x - start.x)

        const inflectionPoints: Point3[] = []

        if (Math.abs(a) < 1e-10) {
            // 二次方程情况
            if (Math.abs(b) > 1e-10) {
                const t = -c / b
                if (t >= 0 && t <= 1) {
                    inflectionPoints.push(this.getPointAt(t))
                }
            }
        } else {
            // 三次方程情况
            const discriminant = b * b - 4 * a * c
            if (discriminant >= 0) {
                const sqrtDiscriminant = Math.sqrt(discriminant)
                const t1 = (-b + sqrtDiscriminant) / (2 * a)
                const t2 = (-b - sqrtDiscriminant) / (2 * a)

                if (t1 >= 0 && t1 <= 1) {
                    inflectionPoints.push(this.getPointAt(t1))
                }
                if (t2 >= 0 && t2 <= 1) {
                    inflectionPoints.push(this.getPointAt(t2))
                }
            }
        }

        return inflectionPoints
    }

    // 检查三次贝塞尔曲线是否是直线
    isLinear(): boolean {
        const start = this.controlPoints[0]
        const control1 = this.controlPoints[1]
        const control2 = this.controlPoints[2]
        const end = this.controlPoints[3]

        // 检查所有控制点是否在起始点和结束点的连线上
        const crossProduct1 = (control1.x - start.x) * (end.y - start.y) - (control1.y - start.y) * (end.x - start.x)
        const crossProduct2 = (control2.x - start.x) * (end.y - start.y) - (control2.y - start.y) * (end.x - start.x)

        return Math.abs(crossProduct1) < 1e-10 && Math.abs(crossProduct2) < 1e-10
    }

    // 获取三次贝塞尔曲线的对称性
    getSymmetry(): { isSymmetric: boolean; axis?: Point3; direction?: Point3 } {
        const start = this.controlPoints[0]
        const control1 = this.controlPoints[1]
        const control2 = this.controlPoints[2]
        const end = this.controlPoints[3]

        // 检查是否关于起始点和结束点的中点对称
        const midPoint = new Point3(
            (start.x + end.x) / 2,
            (start.y + end.y) / 2,
            (start.z + end.z) / 2
        )

        const control1Symmetric = new Point3(
            2 * midPoint.x - control2.x,
            2 * midPoint.y - control2.y,
            2 * midPoint.z - control2.z
        )

        const isSymmetric = Math.abs(control1.x - control1Symmetric.x) < 1e-10 &&
                           Math.abs(control1.y - control1Symmetric.y) < 1e-10 &&
                           Math.abs(control1.z - control1Symmetric.z) < 1e-10

        if (isSymmetric) {
            const direction = new Point3(
                -(end.y - start.y),
                end.x - start.x,
                0
            )
            return { isSymmetric: true, axis: midPoint, direction }
        }

        return { isSymmetric: false }
    }

    // 复制三次贝塞尔曲线
    public copy(): CubicBezier {
        return new CubicBezier(
            this.controlPoints[0].copy(),
            this.controlPoints[1].copy(),
            this.controlPoints[2].copy(),
            this.controlPoints[3].copy(),
            this.style.copy()
        )
    }

    // 创建副本
    protected createCopy(controlPoints: Point3[], style: Style): CubicBezier {
        return new CubicBezier(controlPoints[0], controlPoints[1], controlPoints[2], controlPoints[3], style)
    }

    // 检查是否是三次贝塞尔曲线
    public isCubicBezier(): boolean {
        return true
    }

    // 计算点到曲线的最短距离（AnalyticGraph 要求）
    public distanceToPoint(point: Point3): number {
        const { distance } = this.getClosestPoint(point)
        return distance
    }

    // 获取曲线上最近的点（AnalyticGraph 要求）
    public getClosestPoint(point: Point3): {
        distance: number
        closestPoint: Point3
        parameter: number
    } {
        const result = this.getClosestPointOnCurve(point)
        return {
            distance: result.distance,
            closestPoint: result.point,
            parameter: result.t
        }
    }

    // 计算与另一条解析式图形的交点（AnalyticGraph 要求）
    public getIntersections(other: AnalyticGraph): Point3[] {
        // 简化的交点计算，使用数值方法
        const intersections: Point3[] = []
        const steps = 100
        
        for (let i = 0; i < steps; i++) {
            const t1 = i / steps
            const point1 = this.getPointAt(t1)
            
            for (let j = 0; j < steps; j++) {
                const t2 = j / steps
                const point2 = other.getPointAt(t2)
                
                const dx = point1.x - point2.x
                const dy = point1.y - point2.y
                const distance = Math.sqrt(dx * dx + dy * dy)
                
                if (distance < 1e-6) {
                    intersections.push(point1)
                }
            }
        }
        
        return intersections
    }

    // 获取包围盒（AnalyticGraph 要求）
    public getBoundingBox(): {
        minX: number
        minY: number
        maxX: number
        maxY: number
    } {
        const bounds = this.calculateCurveBounds()
        return {
            minX: bounds.minX,
            minY: bounds.minY,
            maxX: bounds.maxX,
            maxY: bounds.maxY
        }
    }

    // 计算面积（AnalyticGraph 要求）
    public getArea(): number {
        // 对于开放曲线，面积通常为0
        return 0
    }

    // 计算质心（AnalyticGraph 要求）
    public getCentroid(): Point3 {
        const steps = 100
        let sumX = 0, sumY = 0, sumZ = 0
        
        for (let i = 0; i <= steps; i++) {
            const t = i / steps
            const point = this.getPointAt(t)
            sumX += point.x
            sumY += point.y
            sumZ += point.z
        }
        
        return new Point3(sumX / (steps + 1), sumY / (steps + 1), sumZ / (steps + 1))
    }

    // 计算惯性矩（AnalyticGraph 要求）
    public getMomentOfInertia(): number {
        // 简化的惯性矩计算
        const centroid = this.getCentroid()
        const steps = 100
        let moment = 0
        
        for (let i = 0; i <= steps; i++) {
            const t = i / steps
            const point = this.getPointAt(t)
            const dx = point.x - centroid.x
            const dy = point.y - centroid.y
            moment += dx * dx + dy * dy
        }
        
        return moment / (steps + 1)
    }

    // 应用变换矩阵（AnalyticGraph 要求）
    public transform(matrix: Matrix4): AnalyticGraph {
        const transformedPoints = this.controlPoints.map(point => {
            // 简化的变换，假设 Matrix4 有 transformPoint 方法
            // 这里需要根据实际的 Matrix4 实现来调整
            return point // 临时返回原点
        })
        
        return new CubicBezier(
            transformedPoints[0],
            transformedPoints[1],
            transformedPoints[2],
            transformedPoints[3],
            this.style
        )
    }

    // 计算导数（AnalyticGraph 要求）
    public getDerivative(t: number, order: number = 1): Vector3 {
        if (order === 1) {
            return this.getTangentAt(t)
        }
        
        // 对于高阶导数，使用数值微分
        const h = 1e-6
        const t1 = Math.max(0, t - h)
        const t2 = Math.min(1, t + h)
        
        if (order === 2) {
            const p1 = this.getPointAt(t1)
            const p2 = this.getPointAt(t2)
            return new Vector3(
                (p2.x - p1.x) / (2 * h),
                (p2.y - p1.y) / (2 * h),
                (p2.z - p1.z) / (2 * h)
            )
        }
        
        // 递归计算高阶导数
        return this.getDerivative(t, order - 1)
    }

    // 计算积分（AnalyticGraph 要求）
    public getIntegral(tStart: number, tEnd: number): number {
        const clampedStart = Math.max(0, Math.min(1, tStart))
        const clampedEnd = Math.max(0, Math.min(1, tEnd))
        
        if (clampedStart >= clampedEnd) return 0
        
        const steps = 100
        let integral = 0
        
        for (let i = 0; i < steps; i++) {
            const t1 = clampedStart + (clampedEnd - clampedStart) * i / steps
            const t2 = clampedStart + (clampedEnd - clampedStart) * (i + 1) / steps
            const p1 = this.getPointAt(t1)
            const p2 = this.getPointAt(t2)
            
            // 梯形积分
            integral += (p1.x + p2.x) * (t2 - t1) / 2
        }
        
        return integral
    }

    // 静态工厂方法
    static fromPoints(
        startX: number, startY: number,
        control1X: number, control1Y: number,
        control2X: number, control2Y: number,
        endX: number, endY: number,
        style: Style = Style.DEFAULT
    ): CubicBezier {
        return new CubicBezier(
            new Point3(startX, startY, 0),
            new Point3(control1X, control1Y, 0),
            new Point3(control2X, control2Y, 0),
            new Point3(endX, endY, 0),
            style
        )
    }

    static fromControlPoints(
        startPoint: Point3,
        endPoint: Point3,
        control1X: number, control1Y: number,
        control2X: number, control2Y: number,
        style: Style = Style.DEFAULT
    ): CubicBezier {
        return new CubicBezier(
            startPoint,
            new Point3(control1X, control1Y, 0),
            new Point3(control2X, control2Y, 0),
            endPoint,
            style
        )
    }

    // 预定义三次贝塞尔曲线
    static readonly UNIT_CUBIC = new CubicBezier(
        new Point3(0, 0, 0),
        new Point3(0.33, 1, 0),
        new Point3(0.67, 1, 0),
        new Point3(1, 0, 0)
    )
}
