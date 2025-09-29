import { GRAPHTYPE } from "@/constants"
import AnalyticGraph from "./AnalyticGraph"
import { Point3, Vector3, Matrix4 } from "@/core/math"
import { Style } from "@/core/style"
import MathUtils from "@/core/math/MathUtils"
import Bounds from "../base/Bounds"
import { GraphOptions } from "../base/Graph"

export default class Arc extends AnalyticGraph {
    public type: GRAPHTYPE = GRAPHTYPE.ARC
    public controlPoints: Point3[]
    public style: Style

    // 圆弧属性
    public center: Point3
    public radius: number
    public startAngle: number  // 起始角度（弧度）
    public endAngle: number    // 结束角度（弧度）
    public clockwise: boolean  // 是否顺时针

    constructor(
        center: Point3,
        radius: number,
        startAngle: number,
        endAngle: number,
        clockwise: boolean = false,
        style: Style = Style.DEFAULT,
        options?: GraphOptions
    ) {
        super(options)
        this.center = center
        this.radius = radius
        this.startAngle = startAngle
        this.endAngle = endAngle
        this.clockwise = clockwise
        this.style = style
        
        // 计算控制点（用于边界框计算）
        this.controlPoints = this.calculateControlPoints()
        
        // 在构造函数中立即计算边界框，确保View能获取到正确的初始尺寸
        this.setBounds(this.calculateBounds())
    }

    // 计算控制点
    protected calculateControlPoints(): Point3[] {
        const points: Point3[] = []
        
        // 添加起始点
        const startX = this.center.x + this.radius * Math.cos(this.startAngle)
        const startY = this.center.y + this.radius * Math.sin(this.startAngle)
        points.push(new Point3(startX, startY, this.center.z))
        
        // 添加结束点
        const endX = this.center.x + this.radius * Math.cos(this.endAngle)
        const endY = this.center.y + this.radius * Math.sin(this.endAngle)
        points.push(new Point3(endX, endY, this.center.z))
        
        // 添加中心点
        points.push(this.center.copy())
        
        return points
    }


    // 检查角度是否在圆弧范围内
    private isAngleInRange(angle: number): boolean {
        if (this.clockwise) {
            return this.normalizeAngle(angle) >= this.normalizeAngle(this.endAngle) && 
                   this.normalizeAngle(angle) <= this.normalizeAngle(this.startAngle)
        } else {
            return this.normalizeAngle(angle) >= this.normalizeAngle(this.startAngle) && 
                   this.normalizeAngle(angle) <= this.normalizeAngle(this.endAngle)
        }
    }

    // 标准化角度到0-2π范围
    private normalizeAngle(angle: number): number {
        while (angle < 0) angle += 2 * Math.PI
        while (angle >= 2 * Math.PI) angle -= 2 * Math.PI
        return angle
    }

    // 设置中心点
    setCenter(center: Point3): Arc {
        this.center = center
        this.controlPoints = this.calculateControlPoints()
        return this
    }

    // 设置半径
    setRadius(radius: number): Arc {
        this.radius = Math.max(0, radius)
        this.controlPoints = this.calculateControlPoints()
        return this
    }

    // 设置角度
    setAngles(startAngle: number, endAngle: number): Arc {
        this.startAngle = startAngle
        this.endAngle = endAngle
        this.controlPoints = this.calculateControlPoints()
        return this
    }

    // 设置方向
    setClockwise(clockwise: boolean): Arc {
        this.clockwise = clockwise
        return this
    }

    // 获取圆弧长度
    get arcLength(): number {
        let angleDiff = Math.abs(this.endAngle - this.startAngle)
        if (this.clockwise) {
            angleDiff = 2 * Math.PI - angleDiff
        }
        return this.radius * angleDiff
    }

    // 获取圆弧角度差
    get angleDifference(): number {
        let diff = this.endAngle - this.startAngle
        if (this.clockwise) {
            diff = -diff
        }
        return this.normalizeAngle(diff)
    }

    // 获取起始点
    get startPoint(): Point3 {
        return this.controlPoints[0]
    }

    // 获取结束点
    get endPoint(): Point3 {
        return this.controlPoints[1]
    }

    // 获取中点
    get midPoint(): Point3 {
        const midAngle = (this.startAngle + this.endAngle) / 2
        const x = this.center.x + this.radius * Math.cos(midAngle)
        const y = this.center.y + this.radius * Math.sin(midAngle)
        return new Point3(x, y, this.center.z)
    }

    // 渲染圆弧
    public render(ctx: CanvasRenderingContext2D): void {
        const bounds = this.getBounds()
        this.style.applyToContext(ctx, bounds.width, bounds.height)
        
        ctx.beginPath()
        ctx.arc(
            this.center.x, 
            this.center.y, 
            this.radius, 
            this.startAngle, 
            this.endAngle, 
            this.clockwise
        )
        ctx.stroke()
    }

    // 复制圆弧
    public copy(): Arc {
        return new Arc(
            this.center.copy(),
            this.radius,
            this.startAngle,
            this.endAngle,
            this.clockwise,
            this.style.copy()
        )
    }

    // 检查是否是圆弧
    public isArc(): boolean {
        return true
    }

    // 计算圆弧的包围盒
    protected calculateBounds(): Bounds {
        // 获取起始点和结束点
        const startPoint = this.getPointAt(0)
        const endPoint = this.getPointAt(1)
        
        // 初始化边界值
        let minX = Math.min(startPoint.x, endPoint.x)
        let maxX = Math.max(startPoint.x, endPoint.x)
        let minY = Math.min(startPoint.y, endPoint.y)
        let maxY = Math.max(startPoint.y, endPoint.y)
        
        // 检查圆弧是否经过四个象限的极值点
        const quadrantAngles = [0, Math.PI/2, Math.PI, 3*Math.PI/2]
        
        for (const angle of quadrantAngles) {
            if (this.isAngleInArc(angle)) {
                const x = this.center.x + this.radius * Math.cos(angle)
                const y = this.center.y + this.radius * Math.sin(angle)
                minX = Math.min(minX, x)
                maxX = Math.max(maxX, x)
                minY = Math.min(minY, y)
                maxY = Math.max(maxY, y)
            }
        }
        
        return new Bounds(minX, minY, maxX - minX, maxY - minY)
    }

    // 检查角度是否在圆弧范围内
    private isAngleInArc(angle: number): boolean {
        // 标准化角度到 [0, 2π)
        const normalizedAngle = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
        const normalizedStart = ((this.startAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
        const normalizedEnd = ((this.endAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
        
        if (this.clockwise) {
            // 顺时针：从startAngle到endAngle
            if (normalizedStart > normalizedEnd) {
                // 跨越0度的情况
                return normalizedAngle >= normalizedStart || normalizedAngle <= normalizedEnd
            } else {
                return normalizedAngle >= normalizedStart && normalizedAngle <= normalizedEnd
            }
        } else {
            // 逆时针：从startAngle到endAngle
            if (normalizedStart < normalizedEnd) {
                // 跨越0度的情况
                return normalizedAngle <= normalizedStart || normalizedAngle >= normalizedEnd
            } else {
                return normalizedAngle <= normalizedStart && normalizedAngle >= normalizedEnd
            }
        }
    }

    // 静态工厂方法
    static fromCenterAndRadius(
        centerX: number,
        centerY: number,
        radius: number,
        startAngle: number,
        endAngle: number,
        clockwise: boolean = false,
        style: Style = Style.DEFAULT
    ): Arc {
        return new Arc(
            new Point3(centerX, centerY, 0),
            radius,
            startAngle,
            endAngle,
            clockwise,
            style
        )
    }

    static semicircle(
        centerX: number,
        centerY: number,
        radius: number,
        startAngle: number = 0,
        clockwise: boolean = false,
        style: Style = Style.DEFAULT
    ): Arc {
        return new Arc(
            new Point3(centerX, centerY, 0),
            radius,
            startAngle,
            startAngle + Math.PI,
            clockwise,
            style
        )
    }

    static quarterCircle(
        centerX: number,
        centerY: number,
        radius: number,
        startAngle: number = 0,
        clockwise: boolean = false,
        style: Style = Style.DEFAULT
    ): Arc {
        return new Arc(
            new Point3(centerX, centerY, 0),
            radius,
            startAngle,
            startAngle + Math.PI / 2,
            clockwise,
            style
        )
    }

    static fullCircle(
        centerX: number,
        centerY: number,
        radius: number,
        style: Style = Style.DEFAULT
    ): Arc {
        return new Arc(
            new Point3(centerX, centerY, 0),
            radius,
            0,
            2 * Math.PI,
            false,
            style
        )
    }

    // 预定义圆弧
    static readonly UNIT_SEMICIRCLE = Arc.semicircle(0, 0, 1, 0)
    static readonly UNIT_QUARTER_CIRCLE = Arc.quarterCircle(0, 0, 1, 0)
    static readonly UNIT_FULL_CIRCLE = Arc.fullCircle(0, 0, 1)

    // ========== AnalyticGraph 抽象方法实现 ==========

    public getPointAt(t: number): Point3 {
        const angle = this.startAngle + t * (this.endAngle - this.startAngle)
        return new Point3(
            this.center.x + this.radius * Math.cos(angle),
            this.center.y + this.radius * Math.sin(angle),
            this.center.z
        )
    }

    public getTangentAt(t: number): Vector3 {
        const angle = this.startAngle + t * (this.endAngle - this.startAngle)
        return new Vector3(-Math.sin(angle), Math.cos(angle), 0)
    }

    public getNormalAt(t: number): Vector3 {
        const angle = this.startAngle + t * (this.endAngle - this.startAngle)
        return new Vector3(Math.cos(angle), Math.sin(angle), 0)
    }

    public distanceToPoint(point: Point3): number {
        const distanceToCenter = MathUtils.distance(point, this.center)
        return Math.abs(distanceToCenter - this.radius)
    }

    public getClosestPoint(point: Point3): { distance: number; closestPoint: Point3; parameter: number } {
        const distanceToCenter = MathUtils.distance(point, this.center)
        const angle = Math.atan2(point.y - this.center.y, point.x - this.center.x)
        
        // 将角度标准化到圆弧范围内
        const normalizedAngle = this.normalizeAngle(angle)
        const t = this.getParameterFromAngle(normalizedAngle)
        
        const closestPoint = this.getPointAt(t)
        const distance = MathUtils.distance(point, closestPoint)
        
        return { distance, closestPoint, parameter: t }
    }

    public getIntersections(other: AnalyticGraph): Point3[] {
        // 简化实现，返回空数组
        return []
    }

    public getArcLength(tStart: number, tEnd: number): number {
        const angleDiff = Math.abs((tEnd - tStart) * (this.endAngle - this.startAngle))
        return this.radius * angleDiff
    }

    public getTotalLength(): number {
        return this.arcLength
    }

    public getParameterFromArcLength(arcLength: number): number {
        const totalLength = this.getTotalLength()
        if (MathUtils.isZero(totalLength)) return 0
        return Math.max(0, Math.min(1, arcLength / totalLength))
    }

    public getCurvature(t: number): number {
        return 1 / this.radius
    }


    public getArea(): number {
        const angleDiff = Math.abs(this.endAngle - this.startAngle)
        return 0.5 * this.radius * this.radius * angleDiff
    }

    public getCentroid(): Point3 {
        return this.midPoint
    }

    public getMomentOfInertia(): number {
        const angleDiff = Math.abs(this.endAngle - this.startAngle)
        return this.radius * this.radius * this.radius * angleDiff / 3
    }

    public transform(matrix: Matrix4): AnalyticGraph {
        const transformedCenter = this.center.copy()
        return new Arc(transformedCenter, this.radius, this.startAngle, this.endAngle, this.clockwise, this.style)
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

    private getParameterFromAngle(angle: number): number {
        const startNorm = this.normalizeAngle(this.startAngle)
        const endNorm = this.normalizeAngle(this.endAngle)
        const angleNorm = this.normalizeAngle(angle)
        
        if (this.clockwise) {
            if (angleNorm <= startNorm && angleNorm >= endNorm) {
                return (startNorm - angleNorm) / (startNorm - endNorm)
            }
        } else {
            if (angleNorm >= startNorm && angleNorm <= endNorm) {
                return (angleNorm - startNorm) / (endNorm - startNorm)
            }
        }
        
        return 0
    }
}
