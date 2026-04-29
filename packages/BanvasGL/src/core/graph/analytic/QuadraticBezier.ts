import { GRAPHTYPE } from '@/core/constants'
import Bezier from './Bezier'
import { Point3, Vector3 } from '@/core/math'
import { Style } from '@/core/style'
import { IQuadraticBezier } from '@/core/interfaces'
import type { ISerializable } from '@/core/interfaces'
import { generateId } from '@/core/utils'

export default class QuadraticBezier extends Bezier implements IQuadraticBezier, ISerializable {
    public type: GRAPHTYPE = GRAPHTYPE.QUADRATIC_BEZIER

    constructor(
        startPoint: Point3,
        controlPoint: Point3,
        endPoint: Point3,
        style: Style = Style.DEFAULT,
        id?: string
    ) {
        super([startPoint, controlPoint, endPoint], style, id)
        if (!id) this.id = generateId(this.type)
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

        const x =
            oneMinusTSquared * start.x +
            twoTOneMinusT * control.x +
            tSquared * end.x
        const y =
            oneMinusTSquared * start.y +
            twoTOneMinusT * control.y +
            tSquared * end.y
        const z =
            oneMinusTSquared * start.z +
            twoTOneMinusT * control.z +
            tSquared * end.z

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
        const dx =
            2 * oneMinusT * (control.x - start.x) +
            2 * clampedT * (end.x - control.x)
        const dy =
            2 * oneMinusT * (control.y - start.y) +
            2 * clampedT * (end.y - control.y)
        const dz =
            2 * oneMinusT * (control.z - start.z) +
            2 * clampedT * (end.z - control.z)

        return new Vector3(dx, dy, dz)
    }

    // 计算二次贝塞尔曲线的法线方向
    public getNormalAt(t: number): Vector3 {
        const tangent = this.getTangentAt(t)
        // 法线是切线的垂直方向
        return new Vector3(-tangent.y, tangent.x, 0).normalized
    }

    // 检查二次贝塞尔曲线是否是直线
    isLinear(): boolean {
        const start = this.controlPoints[0]
        const control = this.controlPoints[1]
        const end = this.controlPoints[2]

        // 检查控制点是否在起始点和结束点的连线上
        const crossProduct =
            (control.x - start.x) * (end.y - start.y) -
            (control.y - start.y) * (end.x - start.x)
        return Math.abs(crossProduct) < 1e-10
    }

    // ── 序列化 ──
    toJSON(): any {
        return {
            id: this.id,
            type: this.type,
            controlPoints: this.controlPoints.map(p => p.toJSON()),
            style: this.style.toJSON(),
        }
    }

    static fromJSON(data: any): QuadraticBezier {
        const points = data.controlPoints.map((p: any) => Point3.fromJSON(p));
        const qb = new QuadraticBezier(points[0], points[1], points[2], Style.fromJSON(data.style));
        qb.id = data.id;
        return qb;
    }

    // 复制二次贝塞尔曲线
    public copy(): this {
        return new QuadraticBezier(
            this.controlPoints[0].copy(),
            this.controlPoints[1].copy(),
            this.controlPoints[2].copy(),
            this.style.copy()
        ) as this
    }

    public getLength(tStart: number, tEnd: number): number {
        return this.calculateApproximateLength(100) * Math.abs(tEnd - tStart)
    }

    public getArea(): number {
        return 0
    }
}

