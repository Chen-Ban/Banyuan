import { GRAPHTYPE } from "@/constants"
import Style from "@/core/style/Style"
import { Point3 } from "@/core/math"
import Polygon from "./Polygon"
import { GraphOptions } from "../../base/Graph"

/**
 * Triangle类 - 三角形
 * 继承自Polygon，专门用于创建和管理三角形
 */
export default class Triangle extends Polygon {
    public type: GRAPHTYPE = GRAPHTYPE.TRIANGLE

    constructor(p1: Point3, p2: Point3, p3: Point3, style?: Style, options?: GraphOptions) {
        super([p1, p2, p3], style, true, options)
    }

    /**
     * 获取三角形的三个顶点
     */
    public getVertices(): { p1: Point3, p2: Point3, p3: Point3 } {
        return {
            p1: this.vertices[0].copy(),
            p2: this.vertices[1].copy(),
            p3: this.vertices[2].copy()
        }
    }

    /**
     * 设置三角形的三个顶点
     */
    public setVertices(p1: Point3, p2: Point3, p3: Point3): Triangle {
        this.vertices = [p1.copy(), p2.copy(), p3.copy()]
        this.buildPolygonFromVertices()
        return this
    }

    /**
     * 计算三角形的高
     */
    public getHeight(): number {
        const { p1, p2, p3 } = this.getVertices()
        const base = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2))
        const area = this.getArea()
        return (2 * area) / base
    }

    /**
     * 判断三角形类型
     */
    public getTriangleType(): 'equilateral' | 'isosceles' | 'scalene' | 'right' {
        const { p1, p2, p3 } = this.getVertices()
        
        const side1 = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2))
        const side2 = Math.sqrt(Math.pow(p3.x - p2.x, 2) + Math.pow(p3.y - p2.y, 2))
        const side3 = Math.sqrt(Math.pow(p1.x - p3.x, 2) + Math.pow(p1.y - p3.y, 2))
        
        const sides = [side1, side2, side3].sort((a, b) => a - b)
        const [a, b, c] = sides
        
        // 检查是否为直角三角形
        if (Math.abs(a * a + b * b - c * c) < 0.001) {
            return 'right'
        }
        
        // 检查是否为等边三角形
        if (Math.abs(side1 - side2) < 0.001 && Math.abs(side2 - side3) < 0.001) {
            return 'equilateral'
        }
        
        // 检查是否为等腰三角形
        if (Math.abs(side1 - side2) < 0.001 || Math.abs(side2 - side3) < 0.001 || Math.abs(side1 - side3) < 0.001) {
            return 'isosceles'
        }
        
        return 'scalene'
    }

    /**
     * 获取三角形的重心
     */
    public getCentroid(): Point3 {
        const { p1, p2, p3 } = this.getVertices()
        return new Point3(
            (p1.x + p2.x + p3.x) / 3,
            (p1.y + p2.y + p3.y) / 3,
            (p1.z + p2.z + p3.z) / 3
        )
    }

    /**
     * 获取三角形的外心
     */
    public getCircumcenter(): Point3 {
        const { p1, p2, p3 } = this.getVertices()
        
        const ax = p1.x
        const ay = p1.y
        const bx = p2.x
        const by = p2.y
        const cx = p3.x
        const cy = p3.y
        
        const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
        
        if (Math.abs(d) < 0.001) {
            // 三点共线，返回中心点
            return this.getCentroid()
        }
        
        const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d
        const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d
        
        return new Point3(ux, uy, (p1.z + p2.z + p3.z) / 3)
    }

    /**
     * 复制三角形
     */
    public copy(): Triangle {
        const { p1, p2, p3 } = this.getVertices()
        return new Triangle(p1, p2, p3, this.style.copy())
    }

    /**
     * 创建等边三角形
     */
    public static createEquilateral(center: Point3, sideLength: number, style?: Style): Triangle {
        const height = sideLength * Math.sqrt(3) / 2
        const p1 = new Point3(center.x, center.y - height * 2/3, center.z)
        const p2 = new Point3(center.x - sideLength/2, center.y + height * 1/3, center.z)
        const p3 = new Point3(center.x + sideLength/2, center.y + height * 1/3, center.z)
        return new Triangle(p1, p2, p3, style)
    }

    /**
     * 创建等腰三角形
     */
    public static createIsosceles(center: Point3, base: number, height: number, style?: Style): Triangle {
        const p1 = new Point3(center.x, center.y - height/2, center.z)
        const p2 = new Point3(center.x - base/2, center.y + height/2, center.z)
        const p3 = new Point3(center.x + base/2, center.y + height/2, center.z)
        return new Triangle(p1, p2, p3, style)
    }

    /**
     * 创建直角三角形
     */
    public static createRight(center: Point3, width: number, height: number, style?: Style): Triangle {
        const p1 = new Point3(center.x - width/2, center.y - height/2, center.z)
        const p2 = new Point3(center.x + width/2, center.y - height/2, center.z)
        const p3 = new Point3(center.x - width/2, center.y + height/2, center.z)
        return new Triangle(p1, p2, p3, style)
    }
}
