import { GRAPHTYPE } from "@/constants"
import AnalyticGraph from "./AnalyticGraph"
import { Point3, Vector3, Matrix4 } from "@/core/math"
import { Style } from "@/core/style"
import MathUtils from "@/core/math/MathUtils"
import Bounds from "../base/Bounds"
import { GraphOptions } from "../base/Graph"

export default class Line extends AnalyticGraph {
    public type: GRAPHTYPE = GRAPHTYPE.LINE
    public controlPoints: Point3[]
    public style: Style

    constructor(
        startPoint: Point3, 
        endPoint: Point3, 
        style: Style = Style.DEFAULT,
        options?: GraphOptions
    ) {
        super(options)
        this.controlPoints = [startPoint, endPoint]
        this.style = style
        
        // 在构造函数中立即计算边界框，确保View能获取到正确的初始尺寸
        this.setBounds(this.calculateBounds())
    }

    // 获取起始点
    get startPoint(): Point3 {
        return this.controlPoints[0]
    }

    // 获取结束点
    get endPoint(): Point3 {
        return this.controlPoints[1]
    }

    // 计算线条的包围盒
    protected calculateBounds(): Bounds {
        const startPoint = this.controlPoints[0]
        const endPoint = this.controlPoints[1]
        
        const minX = Math.min(startPoint.x, endPoint.x)
        const maxX = Math.max(startPoint.x, endPoint.x)
        const minY = Math.min(startPoint.y, endPoint.y)
        const maxY = Math.max(startPoint.y, endPoint.y)
        
        return new Bounds(minX, minY, maxX - minX, maxY - minY)
    }

    // 设置起始点
    setStartPoint(point: Point3): Line {
        this.controlPoints[0] = point
        return this
    }

    // 设置结束点
    setEndPoint(point: Point3): Line {
        this.controlPoints[1] = point
        return this
    }


    // 获取线条长度
    get length(): number {
        const start = this.startPoint
        const end = this.endPoint
        const dx = end.x - start.x
        const dy = end.y - start.y
        const dz = end.z - start.z
        return Math.sqrt(dx * dx + dy * dy + dz * dz)
    }

    // 获取线条角度（相对于X轴）
    get angle(): number {
        const start = this.startPoint
        const end = this.endPoint
        return Math.atan2(end.y - start.y, end.x - start.x)
    }

    // 获取线条中点
    get midPoint(): Point3 {
        const start = this.startPoint
        const end = this.endPoint
        return new Point3(
            (start.x + end.x) / 2,
            (start.y + end.y) / 2,
            (start.z + end.z) / 2
        )
    }

    public renderPath(ctx: CanvasRenderingContext2D, dependent: Boolean): void {
        dependent && ctx.beginPath()
        ctx.moveTo(this.startPoint.x, this.startPoint.y)
        ctx.lineTo(this.endPoint.x, this.endPoint.y)
    }

    // 渲染线条
    public render(ctx: CanvasRenderingContext2D): void {
        ctx.save()
        const bounds = this.getBounds()
        this.style.applyToContext(ctx, bounds.width, bounds.height)
        this.renderPath(ctx,true)
        ctx.stroke()
        ctx.restore()
    }

    // 复制线条
    public copy(): this {
        return new Line(
            this.startPoint.copy(),
            this.endPoint.copy(),
            this.style.copy()
        ) as this
    }

    // 检查是否是线条
    public isLine(): boolean {
        return true
    }

    // 静态工厂方法
    static fromCoordinates(
        x1: number, 
        y1: number, 
        x2: number, 
        y2: number, 
        z1: number = 0, 
        z2: number = 0,
        style: Style = Style.DEFAULT
    ): Line {
        return new Line(
            new Point3(x1, y1, z1),
            new Point3(x2, y2, z2),
            style
        )
    }

    static horizontal(
        x1: number, 
        x2: number, 
        y: number, 
        style: Style = Style.DEFAULT
    ): Line {
        return new Line(
            new Point3(x1, y, 0),
            new Point3(x2, y, 0),
            style
        )
    }

    static vertical(
        x: number, 
        y1: number, 
        y2: number, 
        style: Style = Style.DEFAULT
    ): Line {
        return new Line(
            new Point3(x, y1, 0),
            new Point3(x, y2, 0),
            style
        )
    }

    static diagonal(
        startX: number, 
        startY: number, 
        length: number, 
        angle: number, 
        style: Style = Style.DEFAULT
    ): Line {
        const endX = startX + length * Math.cos(angle)
        const endY = startY + length * Math.sin(angle)
        return new Line(
            new Point3(startX, startY, 0),
            new Point3(endX, endY, 0),
            style
        )
    }

    // 预定义线条
    static readonly HORIZONTAL_UNIT = Line.horizontal(0, 1, 0)
    static readonly VERTICAL_UNIT = Line.vertical(0, 0, 1)
    static readonly DIAGONAL_UNIT = Line.diagonal(0, 0, Math.sqrt(2), Math.PI / 4)

    // ========== AnalyticGraph 抽象方法实现 ==========

    /**
     * 获取线条上指定参数t处的点
     */
    public getPointAt(t: number): Point3 {
        const start = this.startPoint
        const end = this.endPoint
        return new Point3(
            start.x + t * (end.x - start.x),
            start.y + t * (end.y - start.y),
            start.z + t * (end.z - start.z)
        )
    }

    /**
     * 获取线条上指定参数t处的切线向量
     */
    public getTangentAt(t: number): Vector3 {
        const start = this.startPoint
        const end = this.endPoint
        return new Vector3(end.x - start.x, end.y - start.y, end.z - start.z)
    }

    /**
     * 获取线条上指定参数t处的法向量
     */
    public getNormalAt(t: number): Vector3 {
        const tangent = this.getTangentAt(t)
        return new Vector3(-tangent.y, tangent.x, 0).normalized
    }

    /**
     * 计算点到线条的最短距离
     */
    public distanceToPoint(point: Point3): number {
        return MathUtils.distancePointToLineSegment(point, this.startPoint, this.endPoint)
    }

    /**
     * 计算点到线条的最短距离，并返回最近点
     */
    public getClosestPoint(point: Point3): {
        distance: number
        closestPoint: Point3
        parameter: number
    } {
        const lineVector = this.endPoint.subtract(this.startPoint)
        const pointVector = point.subtract(this.startPoint)
        
        const lineLengthSquared = lineVector.dot(lineVector)
        if (MathUtils.isZero(lineLengthSquared)) {
            return {
                distance: MathUtils.distance(point, this.startPoint),
                closestPoint: this.startPoint.copy(),
                parameter: 0
            }
        }
        
        const t = pointVector.dot(lineVector) / lineLengthSquared
        const closestPoint = this.getPointAt(t)
        const distance = MathUtils.distance(point, closestPoint)
        
        return {
            distance,
            closestPoint,
            parameter: t
        }
    }

    /**
     * 计算线条与另一条解析式图形的交点
     */
    public getIntersections(other: AnalyticGraph): Point3[] {
        if (other instanceof Line) {
            const intersection = MathUtils.lineIntersection(
                this.startPoint, this.endPoint,
                other.startPoint, other.endPoint
            )
            return intersection ? [intersection] : []
        }
        
        // 对于其他类型的图形，使用数值方法求解
        const intersections: Point3[] = []
        const numSamples = 100
        
        for (let i = 0; i < numSamples; i++) {
            const t = i / (numSamples - 1)
            const point = this.getPointAt(t)
            const distance = other.distanceToPoint(point)
            
            if (distance < 1e-6) {
                intersections.push(point)
            }
        }
        
        return intersections
    }

    /**
     * 计算线条在指定参数范围内的长度
     */
    public getArcLength(tStart: number, tEnd: number): number {
        const startPoint = this.getPointAt(tStart)
        const endPoint = this.getPointAt(tEnd)
        return MathUtils.distance(startPoint, endPoint)
    }

    /**
     * 计算线条的总长度
     */
    public getTotalLength(): number {
        return this.length
    }

    /**
     * 根据弧长获取参数值
     */
    public getParameterFromArcLength(arcLength: number): number {
        const totalLength = this.getTotalLength()
        if (MathUtils.isZero(totalLength)) return 0
        return Math.max(0, Math.min(1, arcLength / totalLength))
    }

    /**
     * 计算线条的曲率（直线曲率为0）
     */
    public getCurvature(t: number): number {
        return 0
    }

    /**
     * 计算线条的包围盒
     */
    public getBoundingBox(): {
        minX: number
        minY: number
        maxX: number
        maxY: number
    } {
        const start = this.startPoint
        const end = this.endPoint
        return {
            minX: Math.min(start.x, end.x),
            minY: Math.min(start.y, end.y),
            maxX: Math.max(start.x, end.x),
            maxY: Math.max(start.y, end.y)
        }
    }

    /**
     * 计算线条的面积（直线面积为0）
     */
    public getArea(): number {
        return 0
    }

    /**
     * 计算线条的质心
     */
    public getCentroid(): Point3 {
        return this.midPoint
    }

    /**
     * 计算线条的惯性矩
     */
    public getMomentOfInertia(): number {
        const length = this.getTotalLength()
        return (length * length * length) / 12
    }

    /**
     * 应用变换矩阵到线条
     */
    public transform(matrix: Matrix4): AnalyticGraph {
        // 简单的变换实现，实际应用中需要更完整的矩阵变换
        const transformedStart =matrix.multiply(this.startPoint.copy()) 
        const transformedEnd = matrix.multiply(this.endPoint.copy())
        return new Line(transformedStart, transformedEnd, this.style)
    }

    /**
     * 计算线条的导数
     */
    public getDerivative(t: number, order: number = 1): Vector3 {
        if (order === 1) {
            return this.getTangentAt(t)
        } else if (order > 1) {
            return new Vector3(0, 0, 0) // 直线的二阶及以上导数为零
        }
        return new Vector3(0, 0, 0)
    }

    /**
     * 计算线条的积分
     */
    public getIntegral(tStart: number, tEnd: number): number {
        // 对于直线，积分就是长度
        return this.getArcLength(tStart, tEnd)
    }
}
