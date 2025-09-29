import { GRAPHTYPE } from "@/constants";
import Graph from "../base/Graph";
import { Point3, Vector3, Matrix4 } from "@/core/math";

/**
 * 解析式图形基类
 * 提供基于数学解析式的精确计算功能
 */
export default abstract class AnalyticGraph extends Graph {
    public type: GRAPHTYPE = GRAPHTYPE.ANALYTICGRAPH;
    
    /**
     * 检查是否为解析式图形
     */
    isAnalyticGraph(): boolean {
        return true
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
     * 计算点到图形的最短距离
     * @param point 目标点
     * @returns 最短距离
     */
    public abstract distanceToPoint(point: Point3): number

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
     * 计算图形与另一条解析式图形的交点
     * @param other 另一条解析式图形
     * @returns 交点数组
     */
    public abstract getIntersections(other: AnalyticGraph): Point3[]

    /**
     * 计算图形在指定参数范围内的长度
     * @param tStart 起始参数
     * @param tEnd 结束参数
     * @returns 弧长
     */
    public abstract getArcLength(tStart: number, tEnd: number): number

    /**
     * 计算图形的总长度
     * @returns 总长度
     */
    public abstract getTotalLength(): number

    /**
     * 根据弧长获取参数值
     * @param arcLength 弧长
     * @returns 对应的参数值
     */
    public abstract getParameterFromArcLength(arcLength: number): number

    /**
     * 计算图形的曲率
     * @param t 参数值
     * @returns 曲率值
     */
    public abstract getCurvature(t: number): number

    /**
     * 计算图形的曲率半径
     * @param t 参数值
     * @returns 曲率半径
     */
    public getCurvatureRadius(t: number): number {
        const curvature = this.getCurvature(t)
        return curvature === 0 ? Infinity : 1 / curvature
    }

    /**
     * 计算图形的曲率中心
     * @param t 参数值
     * @returns 曲率中心点
     */
    public getCurvatureCenter(t: number): Point3 {
        const point = this.getPointAt(t)
        const normal = this.getNormalAt(t)
        const radius = this.getCurvatureRadius(t)
        
        return new Point3(
            point.x + normal.x * radius,
            point.y + normal.y * radius,
            point.z + normal.z * radius
        )
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
     * 计算图形的惯性矩
     * @returns 惯性矩
     */
    public abstract getMomentOfInertia(): number

    /**
     * 应用变换矩阵到图形
     * @param matrix 变换矩阵
     * @returns 变换后的图形
     */
    public abstract transform(matrix: Matrix4): AnalyticGraph

    /**
     * 计算图形的导数
     * @param t 参数值
     * @param order 导数阶数
     * @returns 导数向量
     */
    public abstract getDerivative(t: number, order?: number): Vector3

    /**
     * 计算图形的积分
     * @param tStart 起始参数
     * @param tEnd 结束参数
     * @returns 积分值
     */
    public abstract getIntegral(tStart: number, tEnd: number): number

    /**
     * 计算图形的傅里叶变换
     * @param numPoints 采样点数
     * @returns 傅里叶系数
     */
    public getFourierTransform(numPoints: number = 64): {
        real: number[]
        imaginary: number[]
        magnitude: number[]
        phase: number[]
    } {
        const real: number[] = []
        const imaginary: number[] = []
        const magnitude: number[] = []
        const phase: number[] = []

        for (let k = 0; k < numPoints; k++) {
            let realSum = 0
            let imagSum = 0

            for (let n = 0; n < numPoints; n++) {
                const t = n / numPoints
                const point = this.getPointAt(t)
                const angle = -2 * Math.PI * k * n / numPoints
                
                realSum += point.x * Math.cos(angle) + point.y * Math.sin(angle)
                imagSum += point.y * Math.cos(angle) - point.x * Math.sin(angle)
            }

            real[k] = realSum / numPoints
            imaginary[k] = imagSum / numPoints
            magnitude[k] = Math.sqrt(real[k] * real[k] + imaginary[k] * imaginary[k])
            phase[k] = Math.atan2(imaginary[k], real[k])
        }

        return { real, imaginary, magnitude, phase }
    }

    /**
     * 计算图形的自相关函数
     * @param numPoints 采样点数
     * @returns 自相关函数值
     */
    public getAutocorrelation(numPoints: number = 64): number[] {
        const autocorr: number[] = []
        const points: Point3[] = []

        // 采样点
        for (let i = 0; i < numPoints; i++) {
            const t = i / numPoints
            points.push(this.getPointAt(t))
        }

        // 计算自相关
        for (let lag = 0; lag < numPoints; lag++) {
            let sum = 0
            for (let i = 0; i < numPoints - lag; i++) {
                const p1 = points[i]
                const p2 = points[i + lag]
                sum += p1.x * p2.x + p1.y * p2.y
            }
            autocorr[lag] = sum / (numPoints - lag)
        }

        return autocorr
    }

    /**
     * 计算图形的功率谱密度
     * @param numPoints 采样点数
     * @returns 功率谱密度
     */
    public getPowerSpectralDensity(numPoints: number = 64): number[] {
        const { magnitude } = this.getFourierTransform(numPoints)
        return magnitude.map(mag => mag * mag)
    }
}