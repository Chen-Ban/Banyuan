import { GRAPHTYPE } from "@/constants"
import Bezier from "./Bezier"
import { Point3, Vector3, Matrix4 } from "@/core/math"
import { Style } from "@/core/style"
import MathUtils from "@/core/math/MathUtils"
import { GraphOptions } from "../base/Graph"
import Bounds from "../base/Bounds"

export default class QuadraticBezier extends Bezier {
    public type: GRAPHTYPE = GRAPHTYPE.QUADRATIC_BEZIER

    constructor(
        startPoint: Point3,
        controlPoint: Point3,
        endPoint: Point3,
        style: Style = Style.DEFAULT,
        options?: GraphOptions
    ) {
        super([startPoint, controlPoint, endPoint], style, options)
    }

    // 获取控制点
    get controlPoint(): Point3 {
        return this.controlPoints[1]
    }

    // 设置控制点
    setQuadraticControlPoint(controlPoint: Point3): QuadraticBezier {
        this.controlPoints[1] = controlPoint
        return this
    }

    // 计算二次贝塞尔曲线的边界框
    protected calculateBounds(): Bounds {
        const curveBounds = this.calculateCurveBounds()
        return new Bounds(curveBounds.minX, curveBounds.minY, curveBounds.width, curveBounds.height)
    }


    // 计算二次贝塞尔曲线上的点
    public getPointAt(t: number): Point3 {
        const clampedT = Math.max(0, Math.min(1, t))
        const start = this.controlPoints[0]
        const control = this.controlPoints[1]
        const end = this.controlPoints[2]
        

        // 二次贝塞尔曲线公式: B(t) = (1-t)²P₀ + 2(1-t)tP₁ + t²P₂
        const oneMinusT = 1 - clampedT
        const oneMinusTSquared = oneMinusT * oneMinusT
        const twoTOneMinusT = 2 * clampedT * oneMinusT
        const tSquared = clampedT * clampedT

        const x = oneMinusTSquared * start.x + twoTOneMinusT * control.x + tSquared * end.x
        const y = oneMinusTSquared * start.y + twoTOneMinusT * control.y + tSquared * end.y
        const z = oneMinusTSquared * start.z + twoTOneMinusT * control.z + tSquared * end.z

        return new Point3(x, y, z)
    }

    // 计算二次贝塞尔曲线的切线方向
    public getTangentAt(t: number): Vector3 {
        const clampedT = Math.max(0, Math.min(1, t))
        const start = this.controlPoints[0]
        const control = this.controlPoints[1]
        const end = this.controlPoints[2]

        // 切线公式: B'(t) = 2(1-t)(P₁-P₀) + 2t(P₂-P₁)
        const oneMinusT = 1 - clampedT
        const dx = 2 * oneMinusT * (control.x - start.x) + 2 * clampedT * (end.x - control.x)
        const dy = 2 * oneMinusT * (control.y - start.y) + 2 * clampedT * (end.y - control.y)
        const dz = 2 * oneMinusT * (control.z - start.z) + 2 * clampedT * (end.z - control.z)

        return new Vector3(dx, dy, dz)
    }

    // 计算二次贝塞尔曲线的法线方向
    public getNormalAt(t: number): Vector3 {
        const tangent = this.getTangentAt(t)
        // 法线是切线的垂直方向
        return new Vector3(-tangent.y, tangent.x, 0).normalized
    }

    // 计算二次贝塞尔曲线的曲率
    public getCurvatureAt(t: number): number {
        const clampedT = Math.max(0, Math.min(1, t))
        const start = this.controlPoints[0]
        const control = this.controlPoints[1]
        const end = this.controlPoints[2]

        // 二阶导数（曲率相关）
        const d2x = 2 * (end.x - 2 * control.x + start.x)
        const d2y = 2 * (end.y - 2 * control.y + start.y)

        // 一阶导数
        const oneMinusT = 1 - clampedT
        const dx = 2 * oneMinusT * (control.x - start.x) + 2 * clampedT * (end.x - control.x)
        const dy = 2 * oneMinusT * (control.y - start.y) + 2 * clampedT * (end.y - control.y)

        // 曲率公式: κ = |x'y'' - y'x''| / (x'² + y'²)^(3/2)
        const numerator = Math.abs(dx * d2y - dy * d2x)
        const denominator = Math.pow(dx * dx + dy * dy, 1.5)

        return denominator === 0 ? 0 : numerator / denominator
    }

    // 获取二次贝塞尔曲线的长度
    public get length(): number {
        return this.calculateApproximateLength(100)
    }

    // 根据弧长参数获取点
    public getPointAtArcLength(arcLength: number): Point3 {
        const totalLength = this.length
        if (totalLength === 0) return this.startPoint

        const targetT = arcLength / totalLength
        return this.getPointAt(targetT)
    }

    // 获取二次贝塞尔曲线的顶点（最高点或最低点）
    getVertex(): Point3 | null {
        const start = this.controlPoints[0]
        const control = this.controlPoints[1]
        const end = this.controlPoints[2]

        // 计算顶点的t值
        // 对于二次贝塞尔曲线，顶点在 t = (P₁ - P₀) / (2P₁ - P₀ - P₂) 处
        const denominator = 2 * control.x - start.x - end.x
        if (Math.abs(denominator) < 1e-10) {
            return null // 直线情况
        }

        const t = (control.x - start.x) / denominator
        if (t >= 0 && t <= 1) {
            return this.getPointAt(t)
        }

        return null
    }

    // 检查二次贝塞尔曲线是否是直线
    isLinear(): boolean {
        const start = this.controlPoints[0]
        const control = this.controlPoints[1]
        const end = this.controlPoints[2]

        // 检查控制点是否在起始点和结束点的连线上
        const crossProduct = (control.x - start.x) * (end.y - start.y) - (control.y - start.y) * (end.x - start.x)
        return Math.abs(crossProduct) < 1e-10
    }

    // 获取二次贝塞尔曲线的对称轴
    getAxisOfSymmetry(): { point: Point3; direction: Point3 } | null {
        const start = this.controlPoints[0]
        const control = this.controlPoints[1]
        const end = this.controlPoints[2]

        // 对称轴通过控制点，方向垂直于起始点和结束点的连线
        const midPoint = new Point3(
            (start.x + end.x) / 2,
            (start.y + end.y) / 2,
            (start.z + end.z) / 2
        )

        const direction = new Point3(
            -(end.y - start.y),
            end.x - start.x,
            0
        )

        return { point: midPoint, direction }
    }

    // 复制二次贝塞尔曲线
    public copy(): QuadraticBezier {
        return new QuadraticBezier(
            this.controlPoints[0].copy(),
            this.controlPoints[1].copy(),
            this.controlPoints[2].copy(),
            this.style.copy()
        )
    }

    // 创建副本
    protected createCopy(controlPoints: Point3[], style: Style): QuadraticBezier {
        return new QuadraticBezier(controlPoints[0], controlPoints[1], controlPoints[2], style)
    }

    // 检查是否是二次贝塞尔曲线
    public isQuadraticBezier(): boolean {
        return true
    }

    // 静态工厂方法
    static fromPoints(
        startX: number, startY: number,
        controlX: number, controlY: number,
        endX: number, endY: number,
        style: Style = Style.DEFAULT
    ): QuadraticBezier {
        return new QuadraticBezier(
            new Point3(startX, startY, 0),
            new Point3(controlX, controlY, 0),
            new Point3(endX, endY, 0),
            style
        )
    }

    static fromControlPoint(
        startPoint: Point3,
        endPoint: Point3,
        controlX: number,
        controlY: number,
        style: Style = Style.DEFAULT
    ): QuadraticBezier {
        return new QuadraticBezier(
            startPoint,
            new Point3(controlX, controlY, 0),
            endPoint,
            style
        )
    }

    // 预定义二次贝塞尔曲线
    static readonly UNIT_QUADRATIC = new QuadraticBezier(
        new Point3(0, 0, 0),
        new Point3(0.5, 1, 0),
        new Point3(1, 0, 0)
    )

    // ========== AnalyticGraph 抽象方法实现 ==========

    public distanceToPoint(point: Point3): number {
        const { distance } = this.getClosestPoint(point)
        return distance
    }

    public getClosestPoint(point: Point3): { distance: number; closestPoint: Point3; parameter: number } {
        const result = this.getClosestPointOnCurve(point, 100)
        return {
            distance: result.distance,
            closestPoint: result.point,
            parameter: result.t
        }
    }

    public getIntersections(other: any): Point3[] {
        // 简化实现，返回空数组
        return []
    }

    public getArcLength(tStart: number, tEnd: number): number {
        return this.calculateApproximateLength(100) * Math.abs(tEnd - tStart)
    }

    public getTotalLength(): number {
        return this.length
    }

    public getParameterFromArcLength(arcLength: number): number {
        const totalLength = this.getTotalLength()
        if (MathUtils.isZero(totalLength)) return 0
        return Math.max(0, Math.min(1, arcLength / totalLength))
    }

    public getCurvature(t: number): number {
        return this.getCurvatureAt(t)
    }

    public getBoundingBox(): { minX: number; minY: number; maxX: number; maxY: number } {
        const bounds = this.calculateCurveBounds(50)
        return {
            minX: bounds.minX,
            minY: bounds.minY,
            maxX: bounds.maxX,
            maxY: bounds.maxY
        }
    }

    public getArea(): number {
        // 二次贝塞尔曲线的面积（使用格林定理）
        const start = this.controlPoints[0]
        const control = this.controlPoints[1]
        const end = this.controlPoints[2]
        
        return Math.abs(
            (start.x * (control.y - end.y) + 
             control.x * (end.y - start.y) + 
             end.x * (start.y - control.y)) / 6
        )
    }

    public getCentroid(): Point3 {
        return this.getPointAt(0.5)
    }

    public getMomentOfInertia(): number {
        // 简化实现
        return this.getTotalLength() * this.getTotalLength() / 12
    }

    public transform(matrix: Matrix4): any {
        const transformedPoints = this.controlPoints.map(p => p.copy())
        return new QuadraticBezier(transformedPoints[0], transformedPoints[1], transformedPoints[2], this.style)
    }

    public getDerivative(t: number, order?: number): Vector3 {
        if (order === 1) {
            return this.getTangentAt(t)
        }
        return new Vector3(0, 0, 0)
    }

    public getIntegral(tStart: number, tEnd: number): number {
        return this.getArcLength(tStart, tEnd)
    }
}
