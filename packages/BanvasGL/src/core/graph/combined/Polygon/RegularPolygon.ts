import { GRAPHTYPE } from "@/constants"
import Style from "@/core/style/Style"
import { Point3 } from "@/core/math"
import Polygon from "./Polygon"

/**
 * RegularPolygon类 - 正多边形
 * 继承自Polygon，专门用于创建和管理正多边形
 */
export default class RegularPolygon extends Polygon {
    public type: GRAPHTYPE = GRAPHTYPE.REGULAR_POLYGON
    public center: Point3
    public radius: number
    public sides: number
    public rotation: number

    constructor(
        center: Point3, 
        radius: number, 
        sides: number, 
        rotation: number = 0,
        style?: Style
    ) {
        const vertices = RegularPolygon.generateVertices(center, radius, sides, rotation)
        super(vertices, style, true)
        this.center = center.copy()
        this.radius = radius
        this.sides = sides
        this.rotation = rotation
    }

    /**
     * 生成正多边形的顶点
     */
    private static generateVertices(
        center: Point3, 
        radius: number, 
        sides: number, 
        rotation: number
    ): Point3[] {
        const vertices: Point3[] = []
        const angleStep = (2 * Math.PI) / sides

        for (let i = 0; i < sides; i++) {
            const angle = i * angleStep + rotation
            const x = center.x + radius * Math.cos(angle)
            const y = center.y + radius * Math.sin(angle)
            vertices.push(new Point3(x, y, center.z))
        }

        return vertices
    }

    /**
     * 设置中心点
     */
    public setCenter(center: Point3): RegularPolygon {
        this.center = center.copy()
        this.vertices = RegularPolygon.generateVertices(this.center, this.radius, this.sides, this.rotation)
        this.buildPolygonFromVertices()
        return this
    }

    /**
     * 设置半径
     */
    public setRadius(radius: number): RegularPolygon {
        this.radius = radius
        this.vertices = RegularPolygon.generateVertices(this.center, this.radius, this.sides, this.rotation)
        this.buildPolygonFromVertices()
        return this
    }

    /**
     * 设置边数
     */
    public setSides(sides: number): RegularPolygon {
        if (sides < 3) {
            throw new Error('Regular polygon must have at least 3 sides')
        }
        this.sides = sides
        this.vertices = RegularPolygon.generateVertices(this.center, this.radius, this.sides, this.rotation)
        this.buildPolygonFromVertices()
        return this
    }

    /**
     * 设置旋转角度
     */


    /**
     * 获取内角
     */
    public getInteriorAngle(): number {
        return ((this.sides - 2) * Math.PI) / this.sides
    }

    /**
     * 获取外角
     */
    public getExteriorAngle(): number {
        return (2 * Math.PI) / this.sides
    }

    /**
     * 获取边长
     */
    public getSideLength(): number {
        return 2 * this.radius * Math.sin(Math.PI / this.sides)
    }

    /**
     * 获取内切圆半径
     */
    public getInradius(): number {
        return this.radius * Math.cos(Math.PI / this.sides)
    }

    /**
     * 获取面积
     */
    public getArea(): number {
        return (this.sides * this.radius * this.radius * Math.sin(2 * Math.PI / this.sides)) / 2
    }

    /**
     * 获取周长
     */
    public getPerimeter(): number {
        return this.sides * this.getSideLength()
    }

    /**
     * 获取顶点坐标（按索引）
     */
    public getVertex(index: number): Point3 {
        if (index < 0 || index >= this.sides) {
            throw new Error('Vertex index out of bounds')
        }
        return this.vertices[index].copy()
    }

    /**
     * 复制正多边形
     */
    public copy(): this {
        return new RegularPolygon(this.center, this.radius, this.sides, this.rotation, this.style.copy()) as this
    }

    /**
     * 创建正三角形
     */
    public static createTriangle(center: Point3, radius: number, rotation: number = 0, style?: Style): RegularPolygon {
        return new RegularPolygon(center, radius, 3, rotation, style)
    }

    /**
     * 创建正方形
     */
    public static createSquare(center: Point3, radius: number, rotation: number = 0, style?: Style): RegularPolygon {
        return new RegularPolygon(center, radius, 4, rotation, style)
    }

    /**
     * 创建正五边形
     */
    public static createPentagon(center: Point3, radius: number, rotation: number = 0, style?: Style): RegularPolygon {
        return new RegularPolygon(center, radius, 5, rotation, style)
    }

    /**
     * 创建正六边形
     */
    public static createHexagon(center: Point3, radius: number, rotation: number = 0, style?: Style): RegularPolygon {
        return new RegularPolygon(center, radius, 6, rotation, style)
    }

    /**
     * 创建正八边形
     */
    public static createOctagon(center: Point3, radius: number, rotation: number = 0, style?: Style): RegularPolygon {
        return new RegularPolygon(center, radius, 8, rotation, style)
    }

    /**
     * 创建正十二边形
     */
    public static createDodecagon(center: Point3, radius: number, rotation: number = 0, style?: Style): RegularPolygon {
        return new RegularPolygon(center, radius, 12, rotation, style)
    }

    /**
     * 创建星形多边形
     */
    public static createStar(center: Point3, outerRadius: number, innerRadius: number, points: number, rotation: number = 0, style?: Style): RegularPolygon {
        const vertices: Point3[] = []
        const angleStep = Math.PI / points

        for (let i = 0; i < points * 2; i++) {
            const angle = i * angleStep + rotation
            const radius = i % 2 === 0 ? outerRadius : innerRadius
            const x = center.x + radius * Math.cos(angle)
            const y = center.y + radius * Math.sin(angle)
            vertices.push(new Point3(x, y, center.z))
        }

        return new RegularPolygon(center, outerRadius, points * 2, rotation, style)
    }
}
