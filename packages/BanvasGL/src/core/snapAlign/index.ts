import { Line } from '@/core/graph'
import { Point3, Vector3, MathUtils, GeometryUtils } from '@/core/math'
import { View } from '@/core/views'

/**
 * 吸附结果
 */
export interface SnapResult {
    /** 吸附偏移量 */
    offset: Vector3
    /** 是否发生了吸附 */
    snapped: boolean
}

/**
 * 吸附对齐管理器
 * @description 管理场景中的吸附点/线，在视图拖拽时提供吸附对齐功能
 */
class SnapAlignManager {
    /** 吸附阈值（像素） */
    public threshold: number = 5

    /** 吸附点（世界坐标） */
    private snapPoints: Map<View, Point3[]> = new Map()
    /** 吸附线（世界坐标） */
    private snapLines: Map<View, Line[]> = new Map()

    /**
     * 设置吸附阈值
     */
    setThreshold(threshold: number): this {
        this.threshold = threshold
        return this
    }

    /**
     * 注册视图的吸附对象
     */
    registerView(view: View): void {
        const [points, lines] = view.getSnapObjects()
        this.snapPoints.set(view, points)
        this.snapLines.set(view, lines)
    }

    /**
     * 更新视图的吸附对象
     */
    updateView(view: View): void {
        const [points, lines] = view.getSnapObjects()
        this.snapPoints.set(view, points)
        this.snapLines.set(view, lines)
    }

    /**
     * 移除视图的吸附对象
     */
    unregisterView(view: View): void {
        this.snapPoints.delete(view)
        this.snapLines.delete(view)
    }

    /**
     * 清空所有吸附对象
     */
    clear(): void {
        this.snapPoints.clear()
        this.snapLines.clear()
    }

    /**
     * 获取所有吸附点（排除指定视图）
     */
    private getAllSnapPoints(excludeView?: View): Point3[] {
        const points: Point3[] = []
        this.snapPoints.forEach((viewPoints, view) => {
            if (view !== excludeView) {
                points.push(...viewPoints)
            }
        })
        return points
    }

    /**
     * 获取所有吸附线（排除指定视图）
     */
    private getAllSnapLines(excludeView?: View): Line[] {
        const lines: Line[] = []
        this.snapLines.forEach((viewLines, view) => {
            if (view !== excludeView) {
                lines.push(...viewLines)
            }
        })
        return lines
    }

    /**
     * 吸附对齐
     * @param view 当前操作的视图
     * @param worldPoint 当前鼠标世界坐标点
     * @returns 吸附结果
     */
    snapAlign(view: View, worldPoint: Point3): SnapResult {
        const result: SnapResult = {
            offset: new Vector3(0, 0, 0),
            snapped: false,
        }

        // 获取当前视图的吸附对象
        const [sourcePoints, sourceLines] = view.getSnapObjects()

        // 获取其他视图的吸附对象
        const targetPoints = this.getAllSnapPoints(view)
        const targetLines = this.getAllSnapLines(view)

        // 记录最小距离和对应的偏移向量
        let minDistance = Infinity
        let minOffset = new Vector3(0, 0, 0)

        // 1. 点对点吸附
        for (const sourcePoint of sourcePoints) {
            for (const targetPoint of targetPoints) {
                const distance = sourcePoint.distance(targetPoint)
                if (distance <= this.threshold && distance < minDistance) {
                    minDistance = distance
                    minOffset = targetPoint.subtract(sourcePoint)
                    result.snapped = true
                }
            }
        }

        // 2. 点对线吸附
        for (const sourcePoint of sourcePoints) {
            for (const targetLine of targetLines) {
                const distance = GeometryUtils.distancePointToLineSegment(
                    sourcePoint,
                    targetLine.startPoint,
                    targetLine.endPoint
                )
                if (distance <= this.threshold && distance < minDistance) {
                    // 计算投影点，得到偏移向量
                    const closestResult =
                        targetLine.getClosestPoint(sourcePoint)
                    minDistance = distance
                    minOffset = closestResult.closestPoint.subtract(sourcePoint)
                    result.snapped = true
                }
            }
        }

        // 3. 线对点吸附
        for (const sourceLine of sourceLines) {
            for (const targetPoint of targetPoints) {
                const distance = GeometryUtils.distancePointToLineSegment(
                    targetPoint,
                    sourceLine.startPoint,
                    sourceLine.endPoint
                )
                if (distance <= this.threshold && distance < minDistance) {
                    // 计算源线上最近的点，得到偏移向量
                    const closestResult =
                        sourceLine.getClosestPoint(targetPoint)
                    minDistance = distance
                    // 源线上的点需要移动到目标点位置
                    minOffset = targetPoint.subtract(closestResult.closestPoint)
                    result.snapped = true
                }
            }
        }

        // 4. 线对线吸附
        for (const sourceLine of sourceLines) {
            for (const targetLine of targetLines) {
                const distance = this.distanceLineToLine(sourceLine, targetLine)
                if (distance <= this.threshold && distance < minDistance) {
                    // 平行线：计算偏移向量
                    // 找到源线上一点到目标线的投影
                    const closestResult = targetLine.getClosestPoint(
                        sourceLine.startPoint
                    )
                    minDistance = distance
                    minOffset = closestResult.closestPoint.subtract(
                        sourceLine.startPoint
                    )
                    result.snapped = true
                }
            }
        }

        // 设置最终偏移量
        if (result.snapped) {
            result.offset = minOffset
        }

        return result
    }

    /**
     * 计算两条线段之间的距离
     * @description 如果两条线平行，返回它们之间的距离；如果不平行，返回无穷大
     */
    private distanceLineToLine(line1: Line, line2: Line): number {
        const d1 = line1.endPoint.subtract(line1.startPoint)
        const d2 = line2.endPoint.subtract(line2.startPoint)

        // 计算方向向量的叉积
        const cross = d1.cross(d2)
        const crossLength = cross.length

        // 如果叉积长度接近0，说明两条线平行
        if (MathUtils.isZero(crossLength)) {
            // 平行线，计算点到线的距离
            return GeometryUtils.distancePointToLineSegment(
                line1.startPoint,
                line2.startPoint,
                line2.endPoint
            )
        }

        // 不平行，距离为无穷大
        return Infinity
    }
}

export default new SnapAlignManager()
