import { v4 as uuid } from 'uuid'
import { GRAPHTYPE } from '@/core/constants'
import Style from '@/core/style/Style'
import { Matrix4, Point3, Vector3 } from '@/core/math'
import Bounds from './Bounds'
import { getGlobalCanvasContext } from '@/core/renderer/CanvasContext'

export default abstract class Graph {
    // 图形唯一标识
    public id: string
    // 图形类型
    public abstract type: GRAPHTYPE
    // 图形控制点
    public abstract controlPoints: Point3[] | Float32Array
    // 图形样式
    public abstract style: Style
    // 图形包围盒
    public abstract bounds: Bounds
    // transform原点
    public abstract transfromOrigin: Point3
    //构造函数
    constructor(id?: string) {
        this.id = id ?? uuid()
    }
    /**
     * 描绘路径
     * @param ctx 绘制上下文
     * @param dependent 是否是独立路径
     */
    public abstract renderPath(
        ctx: CanvasRenderingContext2D,
        dependent: Boolean
    ): void
    // 渲染方法
    public abstract render(ctx: CanvasRenderingContext2D): void
    // 图形拷贝
    public abstract copy(): this
    // 更新图形包围盒
    public abstract updateBounds(
        orientationX?: boolean,
        orientationY?: boolean
    ): Bounds
    public layout(...params: any[]): Graph | void {}
    /**
     * 判断点是否在图形内部
     * @param p 本地坐标系下的点
     * @returns 是否在路径内
     */
    public isPointInPath(p: Point3): Boolean {
        const ctx = getGlobalCanvasContext()?.bufferCtx
        if (!ctx) return false
        ctx.save()
        this.renderPath(ctx, true)
        const isIn = ctx.isPointInPath(p.x, p.y, 'nonzero')
        ctx.strokeStyle = '#F00'
        ctx.stroke()
        ctx.restore()
        return isIn
    }
    /**
     * 获取图形上指定参数t处的点
     * @param t 参数值，通常在[0,1]范围内
     * @returns 参数t对应的点
     */
    public abstract getPointAt(t: number): Point3

    /**
     * 获取图形上指定参数t处的切线向量
     * @param t 参数值
     * @returns 切线向量
     */
    public abstract getTangentAt(t: number): Vector3

    /**
     * 获取图形上指定参数t处的法向量
     * @param t 参数值
     * @returns 法向量
     */
    public abstract getNormalAt(t: number): Vector3

    /**
     * 计算点到图形的最短距离，并返回最近点
     * @param point 目标点
     * @returns {distance: number, closestPoint: Point3, parameter: number}
     */
    public abstract getClosestPoint(point: Point3): {
        distance: number
        closestPoint: Point3
        parameter: number
    }

    /**
     * 计算图形在指定参数范围内的长度
     * @param tStart 起始参数
     * @param tEnd 结束参数
     * @returns 弧长
     */
    public abstract getLength(tStart: number, tEnd: number): number

    /**
     * 计算图形的总长度
     * @returns 总长度
     */
    public getTotalLength(): number {
        return this.getLength(0, 1)
    }

    /**
     * 检查点是否在图形上（考虑容差）
     * @param point 目标点
     * @param tolerance 容差
     * @returns 是否在图形上
     */
    public isPointOnCurve(point: Point3, tolerance: number = 1e-6): boolean {
        const { distance } = this.getClosestPoint(point)
        return distance <= tolerance
    }

    /**
     * 计算图形的面积（对于封闭图形）
     * @returns 面积
     */
    public abstract getArea(): number

    /**
     * 计算图形的质心
     * @returns 质心点
     */
    public abstract getCentroid(): Point3

    /**
     * 应用变换矩阵到图形
     * @param matrix 变换矩阵
     * @returns 变换后的图形
     */
    public abstract transform(matrix: Matrix4): Graph

    /**
     * 计算与另一个图形的相交点
     * @param other 另一个图形
     * @returns 相交点数组
     */
    public abstract intersect(other: Graph): Point3[]

    // resize
    public abstract resize(
        fixedPoint: Point3,
        dynamicPoint: Point3,
        resizeVector: Vector3
    ): void
}
