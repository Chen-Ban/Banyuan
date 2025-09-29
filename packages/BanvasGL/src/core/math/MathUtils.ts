import { Point3, Vector3, Matrix4 } from "./index"

/**
 * 数学工具类
 * 提供线性代数、数值分析、几何计算等工具函数
 */
export class MathUtils {
    /**
     * 数值精度常量
     */
    public static readonly EPSILON = 1e-10
    public static readonly PI = Math.PI
    public static readonly TWO_PI = 2 * Math.PI
    public static readonly HALF_PI = Math.PI / 2

    /**
     * 检查两个数是否相等（考虑浮点精度）
     */
    public static isEqual(a: number, b: number, epsilon: number = MathUtils.EPSILON): boolean {
        return Math.abs(a - b) < epsilon
    }

    /**
     * 检查数是否为零
     */
    public static isZero(value: number, epsilon: number = MathUtils.EPSILON): boolean {
        return Math.abs(value) < epsilon
    }

    /**
     * 将角度限制在[0, 2π]范围内
     */
    public static normalizeAngle(angle: number): number {
        while (angle < 0) angle += MathUtils.TWO_PI
        while (angle >= MathUtils.TWO_PI) angle -= MathUtils.TWO_PI
        return angle
    }

    /**
     * 将角度限制在[-π, π]范围内
     */
    public static normalizeAngleSigned(angle: number): number {
        while (angle > Math.PI) angle -= MathUtils.TWO_PI
        while (angle < -Math.PI) angle += MathUtils.TWO_PI
        return angle
    }

    /**
     * 线性插值
     */
    public static lerp(a: number, b: number, t: number): number {
        return a + (b - a) * t
    }

    /**
     * 双线性插值
     */
    public static bilinearInterpolate(
        p00: number, p01: number, p10: number, p11: number,
        tx: number, ty: number
    ): number {
        const p0 = MathUtils.lerp(p00, p01, ty)
        const p1 = MathUtils.lerp(p10, p11, ty)
        return MathUtils.lerp(p0, p1, tx)
    }

    /**
     * 三次贝塞尔插值
     */
    public static cubicBezier(p0: number, p1: number, p2: number, p3: number, t: number): number {
        const u = 1 - t
        const tt = t * t
        const uu = u * u
        const uuu = uu * u
        const ttt = tt * t
        
        return uuu * p0 + 3 * uu * t * p1 + 3 * u * tt * p2 + ttt * p3
    }

    /**
     * 计算两点之间的距离
     */
    public static distance(p1: Point3, p2: Point3): number {
        const dx = p2.x - p1.x
        const dy = p2.y - p1.y
        const dz = p2.z - p1.z
        return Math.sqrt(dx * dx + dy * dy + dz * dz)
    }

    /**
     * 计算两点之间的平方距离（避免开方运算）
     */
    public static distanceSquared(p1: Point3, p2: Point3): number {
        const dx = p2.x - p1.x
        const dy = p2.y - p1.y
        const dz = p2.z - p1.z
        return dx * dx + dy * dy + dz * dz
    }

    /**
     * 计算点到直线的距离
     */
    public static distancePointToLine(point: Point3, lineStart: Point3, lineEnd: Point3): number {
        const lineVector = lineEnd.subtract(lineStart)
        const pointVector = point.subtract(lineStart)
        
        const lineLengthSquared = lineVector.dot(lineVector)
        if (MathUtils.isZero(lineLengthSquared)) {
            return MathUtils.distance(point, lineStart)
        }
        
        const t = pointVector.dot(lineVector) / lineLengthSquared
        const projection = new Point3(
            lineStart.x + t * lineVector.x,
            lineStart.y + t * lineVector.y,
            lineStart.z + t * lineVector.z
        )
        
        return MathUtils.distance(point, projection)
    }

    /**
     * 计算点到线段的距离
     */
    public static distancePointToLineSegment(point: Point3, lineStart: Point3, lineEnd: Point3): number {
        const lineVector = lineEnd.subtract(lineStart)
        const pointVector = point.subtract(lineStart)
        
        const lineLengthSquared = lineVector.dot(lineVector)
        if (MathUtils.isZero(lineLengthSquared)) {
            return MathUtils.distance(point, lineStart)
        }
        
        const t = Math.max(0, Math.min(1, pointVector.dot(lineVector) / lineLengthSquared))
        const projection = new Point3(
            lineStart.x + t * lineVector.x,
            lineStart.y + t * lineVector.y,
            lineStart.z + t * lineVector.z
        )
        
        return MathUtils.distance(point, projection)
    }

    /**
     * 计算两条直线的交点
     */
    public static lineIntersection(
        line1Start: Point3, line1End: Point3,
        line2Start: Point3, line2End: Point3
    ): Point3 | null {
        const d1 = line1End.subtract(line1Start)
        const d2 = line2End.subtract(line2Start)
        const w = line1Start.subtract(line2Start)
        
        const d1d2 = d1.dot(d2)
        const d1d1 = d1.dot(d1)
        const d2d2 = d2.dot(d2)
        const wd1 = w.dot(d1)
        const wd2 = w.dot(d2)
        
        const denominator = d1d1 * d2d2 - d1d2 * d1d2
        if (MathUtils.isZero(denominator)) {
            return null // 平行线
        }
        
        const t1 = (d1d2 * wd2 - d2d2 * wd1) / denominator
        const t2 = (d1d1 * wd2 - d1d2 * wd1) / denominator
        
        return new Point3(
            line1Start.x + t1 * d1.x,
            line1Start.y + t1 * d1.y,
            line1Start.z + t1 * d1.z
        )
    }

    /**
     * 计算两条线段的交点
     */
    public static lineSegmentIntersection(
        seg1Start: Point3, seg1End: Point3,
        seg2Start: Point3, seg2End: Point3
    ): Point3 | null {
        const intersection = MathUtils.lineIntersection(seg1Start, seg1End, seg2Start, seg2End)
        if (!intersection) return null
        
        // 检查交点是否在两个线段上
        const t1 = MathUtils.getParameterOnLineSegment(intersection, seg1Start, seg1End)
        const t2 = MathUtils.getParameterOnLineSegment(intersection, seg2Start, seg2End)
        
        if (t1 >= 0 && t1 <= 1 && t2 >= 0 && t2 <= 1) {
            return intersection
        }
        
        return null
    }

    /**
     * 获取点在线段上的参数值
     */
    public static getParameterOnLineSegment(point: Point3, lineStart: Point3, lineEnd: Point3): number {
        const lineVector = lineEnd.subtract(lineStart)
        const pointVector = point.subtract(lineStart)
        
        const lineLengthSquared = lineVector.dot(lineVector)
        if (MathUtils.isZero(lineLengthSquared)) {
            return 0
        }
        
        return pointVector.dot(lineVector) / lineLengthSquared
    }

    /**
     * 计算三角形的面积
     */
    public static triangleArea(p1: Point3, p2: Point3, p3: Point3): number {
        const v1 = p2.subtract(p1)
        const v2 = p3.subtract(p1)
        const cross = v1.cross(v2)
        return cross.length / 2
    }

    /**
     * 计算多边形的面积（鞋带公式）
     */
    public static polygonArea(points: Point3[]): number {
        if (points.length < 3) return 0
        
        let area = 0
        for (let i = 0; i < points.length; i++) {
            const current = points[i]
            const next = points[(i + 1) % points.length]
            area += current.x * next.y - next.x * current.y
        }
        return Math.abs(area) / 2
    }

    /**
     * 计算多边形的质心
     */
    public static polygonCentroid(points: Point3[]): Point3 {
        if (points.length === 0) return new Point3(0, 0, 0)
        
        let sumX = 0, sumY = 0, sumZ = 0
        for (const point of points) {
            sumX += point.x
            sumY += point.y
            sumZ += point.z
        }
        
        return new Point3(
            sumX / points.length,
            sumY / points.length,
            sumZ / points.length
        )
    }

    /**
     * 计算点到多边形的距离
     */
    public static distancePointToPolygon(point: Point3, polygon: Point3[]): number {
        if (polygon.length < 3) return Infinity
        
        let minDistance = Infinity
        
        for (let i = 0; i < polygon.length; i++) {
            const current = polygon[i]
            const next = polygon[(i + 1) % polygon.length]
            const distance = MathUtils.distancePointToLineSegment(point, current, next)
            minDistance = Math.min(minDistance, distance)
        }
        
        return minDistance
    }

    /**
     * 检查点是否在多边形内部（射线法）
     */
    public static isPointInPolygon(point: Point3, polygon: Point3[]): boolean {
        if (polygon.length < 3) return false
        
        let inside = false
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const vi = polygon[i]
            const vj = polygon[j]
            
            if (((vi.y > point.y) !== (vj.y > point.y)) &&
                (point.x < (vj.x - vi.x) * (point.y - vi.y) / (vj.y - vi.y) + vi.x)) {
                inside = !inside
            }
        }
        return inside
    }

    /**
     * 计算圆的面积
     */
    public static circleArea(radius: number): number {
        return Math.PI * radius * radius
    }

    /**
     * 计算圆的周长
     */
    public static circleCircumference(radius: number): number {
        return 2 * Math.PI * radius
    }

    /**
     * 计算点到圆的距离
     */
    public static distancePointToCircle(point: Point3, center: Point3, radius: number): number {
        const distance = MathUtils.distance(point, center)
        return Math.abs(distance - radius)
    }

    /**
     * 计算两个圆的交点
     */
    public static circleIntersection(
        center1: Point3, radius1: number,
        center2: Point3, radius2: number
    ): Point3[] {
        const d = MathUtils.distance(center1, center2)
        
        if (d > radius1 + radius2 || d < Math.abs(radius1 - radius2)) {
            return [] // 无交点
        }
        
        if (MathUtils.isZero(d)) {
            return [] // 同心圆
        }
        
        const a = (radius1 * radius1 - radius2 * radius2 + d * d) / (2 * d)
        const h = Math.sqrt(radius1 * radius1 - a * a)
        
        const p2 = new Point3(
            center1.x + a * (center2.x - center1.x) / d,
            center1.y + a * (center2.y - center1.y) / d,
            center1.z + a * (center2.z - center1.z) / d
        )
        
        const intersection1 = new Point3(
            p2.x + h * (center2.y - center1.y) / d,
            p2.y - h * (center2.x - center1.x) / d,
            p2.z
        )
        
        const intersection2 = new Point3(
            p2.x - h * (center2.y - center1.y) / d,
            p2.y + h * (center2.x - center1.x) / d,
            p2.z
        )
        
        return [intersection1, intersection2]
    }

    /**
     * 数值积分（梯形法则）
     */
    public static integrateTrapezoidal(
        func: (x: number) => number,
        a: number,
        b: number,
        n: number = 1000
    ): number {
        const h = (b - a) / n
        let sum = (func(a) + func(b)) / 2
        
        for (let i = 1; i < n; i++) {
            sum += func(a + i * h)
        }
        
        return sum * h
    }

    /**
     * 数值积分（辛普森法则）
     */
    public static integrateSimpson(
        func: (x: number) => number,
        a: number,
        b: number,
        n: number = 1000
    ): number {
        if (n % 2 !== 0) n++ // 确保n为偶数
        
        const h = (b - a) / n
        let sum = func(a) + func(b)
        
        for (let i = 1; i < n; i++) {
            const x = a + i * h
            if (i % 2 === 0) {
                sum += 2 * func(x)
            } else {
                sum += 4 * func(x)
            }
        }
        
        return sum * h / 3
    }

    /**
     * 牛顿-拉夫逊法求根
     */
    public static newtonRaphson(
        func: (x: number) => number,
        derivative: (x: number) => number,
        initialGuess: number,
        tolerance: number = MathUtils.EPSILON,
        maxIterations: number = 100
    ): number | null {
        let x = initialGuess
        
        for (let i = 0; i < maxIterations; i++) {
            const fx = func(x)
            const fpx = derivative(x)
            
            if (MathUtils.isZero(fpx)) {
                return null // 导数为零
            }
            
            const newX = x - fx / fpx
            
            if (Math.abs(newX - x) < tolerance) {
                return newX
            }
            
            x = newX
        }
        
        return null // 未收敛
    }

    /**
     * 二分法求根
     */
    public static bisection(
        func: (x: number) => number,
        a: number,
        b: number,
        tolerance: number = MathUtils.EPSILON,
        maxIterations: number = 100
    ): number | null {
        if (func(a) * func(b) > 0) {
            return null // 区间内无根
        }
        
        for (let i = 0; i < maxIterations; i++) {
            const c = (a + b) / 2
            const fc = func(c)
            
            if (Math.abs(fc) < tolerance || (b - a) / 2 < tolerance) {
                return c
            }
            
            if (func(a) * fc < 0) {
                b = c
            } else {
                a = c
            }
        }
        
        return null
    }

    /**
     * 计算矩阵的行列式
     */
    public static matrixDeterminant(matrix: Matrix4): number {
        const m = matrix.transform
        return m[0] * (m[5] * (m[10] * m[15] - m[11] * m[14]) - m[6] * (m[9] * m[15] - m[11] * m[13]) + m[7] * (m[9] * m[14] - m[10] * m[13])) -
               m[1] * (m[4] * (m[10] * m[15] - m[11] * m[14]) - m[6] * (m[8] * m[15] - m[11] * m[12]) + m[7] * (m[8] * m[14] - m[10] * m[12])) +
               m[2] * (m[4] * (m[9] * m[15] - m[11] * m[13]) - m[5] * (m[8] * m[15] - m[11] * m[12]) + m[7] * (m[8] * m[13] - m[9] * m[12])) -
               m[3] * (m[4] * (m[9] * m[14] - m[10] * m[13]) - m[5] * (m[8] * m[14] - m[10] * m[12]) + m[6] * (m[8] * m[13] - m[9] * m[12]))
    }

    /**
     * 计算矩阵的逆矩阵
     */
    public static matrixInverse(matrix: Matrix4): Matrix4 | null {
        const det = MathUtils.matrixDeterminant(matrix)
        if (MathUtils.isZero(det)) {
            return null // 矩阵不可逆
        }
        
        const m = matrix.transform
        const inv = new Float32Array(16)
        
        inv[0] = (m[5] * (m[10] * m[15] - m[11] * m[14]) - m[6] * (m[9] * m[15] - m[11] * m[13]) + m[7] * (m[9] * m[14] - m[10] * m[13])) / det
        inv[1] = -(m[1] * (m[10] * m[15] - m[11] * m[14]) - m[2] * (m[9] * m[15] - m[11] * m[13]) + m[3] * (m[9] * m[14] - m[10] * m[13])) / det
        inv[2] = (m[1] * (m[6] * m[15] - m[7] * m[14]) - m[2] * (m[5] * m[15] - m[7] * m[13]) + m[3] * (m[5] * m[14] - m[6] * m[13])) / det
        inv[3] = -(m[1] * (m[6] * m[11] - m[7] * m[10]) - m[2] * (m[5] * m[11] - m[7] * m[9]) + m[3] * (m[5] * m[10] - m[6] * m[9])) / det
        
        inv[4] = -(m[4] * (m[10] * m[15] - m[11] * m[14]) - m[6] * (m[8] * m[15] - m[11] * m[12]) + m[7] * (m[8] * m[14] - m[10] * m[12])) / det
        inv[5] = (m[0] * (m[10] * m[15] - m[11] * m[14]) - m[2] * (m[8] * m[15] - m[11] * m[12]) + m[3] * (m[8] * m[14] - m[10] * m[12])) / det
        inv[6] = -(m[0] * (m[6] * m[15] - m[7] * m[14]) - m[2] * (m[4] * m[15] - m[7] * m[12]) + m[3] * (m[4] * m[14] - m[6] * m[12])) / det
        inv[7] = (m[0] * (m[6] * m[11] - m[7] * m[10]) - m[2] * (m[4] * m[11] - m[7] * m[8]) + m[3] * (m[4] * m[10] - m[6] * m[8])) / det
        
        inv[8] = (m[4] * (m[9] * m[15] - m[11] * m[13]) - m[5] * (m[8] * m[15] - m[11] * m[12]) + m[7] * (m[8] * m[13] - m[9] * m[12])) / det
        inv[9] = -(m[0] * (m[9] * m[15] - m[11] * m[13]) - m[1] * (m[8] * m[15] - m[11] * m[12]) + m[3] * (m[8] * m[13] - m[9] * m[12])) / det
        inv[10] = (m[0] * (m[5] * m[15] - m[7] * m[13]) - m[1] * (m[4] * m[15] - m[7] * m[12]) + m[3] * (m[4] * m[13] - m[5] * m[12])) / det
        inv[11] = -(m[0] * (m[5] * m[11] - m[7] * m[9]) - m[1] * (m[4] * m[11] - m[7] * m[8]) + m[3] * (m[4] * m[9] - m[5] * m[8])) / det
        
        inv[12] = -(m[4] * (m[9] * m[14] - m[10] * m[13]) - m[5] * (m[8] * m[14] - m[10] * m[12]) + m[6] * (m[8] * m[13] - m[9] * m[12])) / det
        inv[13] = (m[0] * (m[9] * m[14] - m[10] * m[13]) - m[1] * (m[8] * m[14] - m[10] * m[12]) + m[2] * (m[8] * m[13] - m[9] * m[12])) / det
        inv[14] = -(m[0] * (m[5] * m[14] - m[6] * m[13]) - m[1] * (m[4] * m[14] - m[6] * m[12]) + m[2] * (m[4] * m[13] - m[5] * m[12])) / det
        inv[15] = (m[0] * (m[5] * m[10] - m[6] * m[9]) - m[1] * (m[4] * m[10] - m[6] * m[8]) + m[2] * (m[4] * m[9] - m[5] * m[8])) / det
        
        return new Matrix4(inv)
    }
}

export default MathUtils
