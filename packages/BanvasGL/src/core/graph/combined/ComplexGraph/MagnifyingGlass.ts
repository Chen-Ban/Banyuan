import { GRAPHTYPE } from "@/constants"
import Style from "@/core/style/Style"
import { Point3 } from "@/core/math"
import ComplexGraph from "./ComplexGraph"
import { Circle, Line } from "../../analytic"
import { Color } from "@/core/style"
import Bounds from "../../base/Bounds"
import { GraphOptions } from "../../base/Graph"

/**
 * MagnifyingGlass类 - 放大镜简笔画
 * 继承自ComplexGraph，由圆形镜片和手柄组成
 */
export default class MagnifyingGlass extends ComplexGraph {
    public type: GRAPHTYPE = GRAPHTYPE.MAGNIFYING_GLASS
    public center: Point3
    public radius: number
    public handleLength: number
    public handleAngle: number
    public lensThickness: number

    constructor(
        center: Point3,
        radius: number = 30,
        handleLength: number = 60,
        handleAngle: number = Math.PI / 4,
        lensThickness: number = 3,
        style?: Style,
        options?: GraphOptions
    ) {
        super([], style, options)
        this.center = center.copy()
        this.radius = radius
        this.handleLength = handleLength
        this.handleAngle = handleAngle
        this.lensThickness = lensThickness
        
        this.buildMagnifyingGlass()
    }

    /**
     * 构建放大镜图形
     */
    private buildMagnifyingGlass(): void {
        this.clearGraphs()
        
        // 创建镜片外圈
        const lensOuter = new Circle(
            this.center,
            this.radius,
            this.style || new Style().setStrokeColor(Color.BLACK).setStrokeWidth(2)
        )
        this.addGraph(lensOuter)
        
        // 创建镜片内圈（表示玻璃）
        const lensInner = new Circle(
            this.center,
            this.radius - this.lensThickness,
            this.style || new Style().setStrokeColor(Color.BLACK).setStrokeWidth(1)
        )
        this.addGraph(lensInner)
        
        // 创建手柄
        const handleStart = new Point3(
            this.center.x + this.radius * Math.cos(this.handleAngle),
            this.center.y + this.radius * Math.sin(this.handleAngle),
            this.center.z
        )
        
        const handleEnd = new Point3(
            handleStart.x + this.handleLength * Math.cos(this.handleAngle),
            handleStart.y + this.handleLength * Math.sin(this.handleAngle),
            handleStart.z
        )
        
        const handle = new Line(
            handleStart,
            handleEnd,
            this.style || new Style().setStrokeColor(Color.BLACK).setStrokeWidth(3)
        )
        this.addGraph(handle)
        
        // 添加一些装饰性的细节
        this.addDecorativeDetails()
    }

    /**
     * 添加装饰性细节
     */
    private addDecorativeDetails(): void {
        // 在镜片中心添加一个小圆点表示焦点
        const focusPoint = new Circle(
            this.center,
            2,
            this.style || new Style().setFillColor(Color.BLACK)
        )
        this.addGraph(focusPoint)
        
        // 在手柄末端添加一个小圆点
        const handleEnd = new Point3(
            this.center.x + this.radius * Math.cos(this.handleAngle) + this.handleLength * Math.cos(this.handleAngle),
            this.center.y + this.radius * Math.sin(this.handleAngle) + this.handleLength * Math.sin(this.handleAngle),
            this.center.z
        )
        
        const handleEndPoint = new Circle(
            handleEnd,
            3,
            this.style || new Style().setFillColor(Color.BLACK)
        )
        this.addGraph(handleEndPoint)
    }

    /**
     * 设置中心位置
     */
    public setCenter(center: Point3): MagnifyingGlass {
        this.center = center.copy()
        this.buildMagnifyingGlass()
        return this
    }

    /**
     * 设置半径
     */
    public setRadius(radius: number): MagnifyingGlass {
        this.radius = radius
        this.buildMagnifyingGlass()
        return this
    }

    /**
     * 设置手柄长度
     */
    public setHandleLength(length: number): MagnifyingGlass {
        this.handleLength = length
        this.buildMagnifyingGlass()
        return this
    }

    /**
     * 设置手柄角度
     */
    public setHandleAngle(angle: number): MagnifyingGlass {
        this.handleAngle = angle
        this.buildMagnifyingGlass()
        return this
    }

    /**
     * 设置镜片厚度
     */
    public setLensThickness(thickness: number): MagnifyingGlass {
        this.lensThickness = thickness
        this.buildMagnifyingGlass()
        return this
    }


    /**
     * 获取镜片中心
     */
    public getLensCenter(): Point3 {
        return this.center.copy()
    }

    /**
     * 获取手柄起点
     */
    public getHandleStart(): Point3 {
        return new Point3(
            this.center.x + this.radius * Math.cos(this.handleAngle),
            this.center.y + this.radius * Math.sin(this.handleAngle),
            this.center.z
        )
    }

    /**
     * 获取手柄终点
     */
    public getHandleEnd(): Point3 {
        const handleStart = this.getHandleStart()
        return new Point3(
            handleStart.x + this.handleLength * Math.cos(this.handleAngle),
            handleStart.y + this.handleLength * Math.sin(this.handleAngle),
            handleStart.z
        )
    }

    /**
     * 获取放大镜的边界框
     */
    protected calculateBounds(): Bounds {
        const handleEnd = this.getHandleEnd()
        const minX = Math.min(this.center.x - this.radius, handleEnd.x)
        const maxX = Math.max(this.center.x + this.radius, handleEnd.x)
        const minY = Math.min(this.center.y - this.radius, handleEnd.y)
        const maxY = Math.max(this.center.y + this.radius, handleEnd.y)
        
        return new Bounds(minX, minY, maxX - minX, maxY - minY)
    }

    /**
     * 检查点是否在镜片内
     */
    public isPointInLens(point: Point3): boolean {
        const dx = point.x - this.center.x
        const dy = point.y - this.center.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        return distance <= this.radius
    }

    /**
     * 检查点是否在手柄上
     */
    public isPointOnHandle(point: Point3, tolerance: number = 5): boolean {
        const handleStart = this.getHandleStart()
        const handleEnd = this.getHandleEnd()
        
        // 计算点到线段的距离
        const A = point.x - handleStart.x
        const B = point.y - handleStart.y
        const C = handleEnd.x - handleStart.x
        const D = handleEnd.y - handleStart.y
        
        const dot = A * C + B * D
        const lenSq = C * C + D * D
        
        if (lenSq === 0) return false
        
        const param = dot / lenSq
        
        let xx, yy
        if (param < 0) {
            xx = handleStart.x
            yy = handleStart.y
        } else if (param > 1) {
            xx = handleEnd.x
            yy = handleEnd.y
        } else {
            xx = handleStart.x + param * C
            yy = handleStart.y + param * D
        }
        
        const dx = point.x - xx
        const dy = point.y - yy
        const distance = Math.sqrt(dx * dx + dy * dy)
        
        return distance <= tolerance
    }

    /**
     * 复制放大镜
     */
    public copy(): this {
        return new MagnifyingGlass(
            this.center,
            this.radius,
            this.handleLength,
            this.handleAngle,
            this.lensThickness,
        ) as this
    }

    /**
     * 创建标准放大镜
     */
    public static createStandard(center: Point3, style?: Style): MagnifyingGlass {
        return new MagnifyingGlass(center, 30, 60, Math.PI / 4, 3, style)
    }

    /**
     * 创建大放大镜
     */
    public static createLarge(center: Point3, style?: Style): MagnifyingGlass {
        return new MagnifyingGlass(center, 50, 100, Math.PI / 4, 5, style)
    }

    /**
     * 创建小放大镜
     */
    public static createSmall(center: Point3, style?: Style): MagnifyingGlass {
        return new MagnifyingGlass(center, 20, 40, Math.PI / 4, 2, style)
    }

    /**
     * 创建水平放大镜
     */
    public static createHorizontal(center: Point3, style?: Style): MagnifyingGlass {
        return new MagnifyingGlass(center, 30, 60, 0, 3, style)
    }

    /**
     * 创建垂直放大镜
     */
    public static createVertical(center: Point3, style?: Style): MagnifyingGlass {
        return new MagnifyingGlass(center, 30, 60, Math.PI / 2, 3, style)
    }

    /**
     * 创建彩色放大镜
     */
    public static createColored(center: Point3, color: Color, style?: Style): MagnifyingGlass {
        const coloredStyle = style || new Style()
        coloredStyle.setStrokeColor(color).setFillColor(color)
        return new MagnifyingGlass(center, 30, 60, Math.PI / 4, 3, coloredStyle)
    }
}
