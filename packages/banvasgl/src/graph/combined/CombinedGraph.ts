import { GRAPHTYPE } from '@/foundation/constants'
import Style from '@/foundation/style/Style'
import { Point3, Vector3, Matrix4, GeometryUtils } from '@/foundation/math'
import Graph from '@/graph/base/Graph'
import Bounds from '@/graph/base/Bounds'
import { isGraphType, isAnalyticGraph, isMediaElement, isCombinedGraph, ICombinedGraph } from '@/types'
import type { ISerializable } from '@/types'
import { generateId } from '@/foundation/utils'

/**
 * CombinedGraph类 - 组合多个图形元素的复合图形
 * 可以包含多个子图形，统一管理和渲染
 */
export default class CombinedGraph extends Graph implements ICombinedGraph, ISerializable {
    public type: GRAPHTYPE = GRAPHTYPE.COMBINED_GRAPH
    public graphs: Graph[] = []
    public style: Style
    public bounds: Bounds
    public transfromOrigin: Point3

    constructor(graphs: Graph[] = [], style?: Style) {
        super()
        this.graphs = [...graphs]
        this.style = style || new Style()
        this.transfromOrigin = this.getCentroid()

        // 在构造函数中立即计算边界框，确保View能获取到正确的初始尺寸
        this.bounds = this.updateBounds(true, true)
        this.id = generateId(this.type)
    }

    public getArea(): number {
        throw new Error('暂不支持复杂图形的面积计算，待后续新增图形积分后计算')
    }

    public getClosestPoint(point: Point3): {
        distance: number
        closestPoint: Point3
        parameter: number
    } {
        const results = this.graphs.map((g) => g.getClosestPoint(point))
        const minDistance = Math.min(...results.map((res) => res.distance))
        return results.find((res) => res.distance === minDistance)!
    }

    public getCentroid(): Point3 {
        if (this.graphs.length === 0) {
            return new Point3(0, 0, 0)
        }
        return this.graphs
            .map((g) => g.getCentroid())
            .reduce((a, b) => GeometryUtils.midpoint(a, b))
    }

    public getLength(tStart: number, tEnd: number): number {
        const [startGraph, startT] = this.getTAtInnerGraph(tStart)
        const [endGraph, endT] = this.getTAtInnerGraph(tEnd)
        const startIndex = this.graphs.findIndex((g) => g === startGraph)
        const endIndex = this.graphs.findIndex((g) => g === endGraph)
        const graphs = this.graphs.filter(
            (g, i) => i > startIndex && i < endIndex
        )
        return (
            startGraph.getLength(startT, 1) +
            graphs.reduce((a, b) => a + b.getLength(0, 1), 0) +
            endGraph.getLength(0, endT)
        )
    }

    private getTAtInnerGraph(t: number): [Graph, number] {
        const lengths = this.graphs.map((g) => g.getLength(0, 1))
        const length = lengths.reduce((a, b) => a + b)
        let targetLength = length * t
        for (const [i, graph] of this.graphs.entries()) {
            if (targetLength > graph.getLength(0, 1)) {
                targetLength -= lengths[i]
                continue
            }
            return [graph, targetLength / lengths[i]]
        }
        throw new Error('找不到对应参数量的图形')
    }

    public getPointAt(t: number): Point3 {
        const [graph, innerT] = this.getTAtInnerGraph(t)
        return graph.getPointAt(innerT)
    }

    public getTangentAt(t: number): Vector3 {
        const [graph, innerT] = this.getTAtInnerGraph(t)
        return graph.getTangentAt(innerT)
    }

    public getNormalAt(t: number): Vector3 {
        const [graph, innerT] = this.getTAtInnerGraph(t)
        return graph.getNormalAt(innerT)
    }

    /**
     * 计算组合图形的包围盒
     */
    public updateBounds(
        orientationX?: boolean,
        orientationY?: boolean
    ): Bounds {
        if (this.graphs.length === 0) {
            return Bounds.empty()
        }

        // 收集所有采样点
        const samplePoints: Point3[] = []

        for (const graph of this.graphs) {
            // 1. 分析图形（解析式图形）：使用采样点
            if (isAnalyticGraph(graph)) {
                const steps = graph.getTotalLength()
                for (let i = 0; i <= steps; i++) {
                    const t = i / steps
                    samplePoints.push(graph.getPointAt(t))
                }
            }
            // 2. 媒体图形（图片、视频）：从 bounds 获取四个角点
            else if (
                isMediaElement(graph) ||
                isCombinedGraph(graph)
            ) {
                const bounds = graph.bounds
                if (bounds && !bounds.isEmpty) {
                    samplePoints.push(new Point3(bounds.x, bounds.y, 0))
                    samplePoints.push(
                        new Point3(bounds.x + bounds.width, bounds.y, 0)
                    )
                    samplePoints.push(
                        new Point3(
                            bounds.x + bounds.width,
                            bounds.y + bounds.height,
                            0
                        )
                    )
                    samplePoints.push(
                        new Point3(bounds.x, bounds.y + bounds.height, 0)
                    )
                }
            }
            // 3. 其他图形（如密集轨迹等）：从控制点采样
            else if (isGraphType(graph, GRAPHTYPE.DENSETRAJECTORY)) {
                for (let i = 0; i < graph.controlPoints.length; i += 3) {
                    samplePoints.push(
                        new Point3(
                            graph.controlPoints[i],
                            graph.controlPoints[i + 1],
                            graph.controlPoints[i + 2]
                        )
                    )
                }
            }
        }

        // 如果没有采样点，返回空(TODO： 监控)
        if (samplePoints.length === 0) {
            return Bounds.empty()
        }
        return Bounds.fromPoints(
            samplePoints,
            orientationX ?? this.bounds?.width > 0,
            orientationY ?? this.bounds?.height > 0
        )
    }

    isPointOnCurve(point: Point3, tolerance: number = 1e-6): boolean {
        return this.graphs.some((graph) =>
            graph.isPointOnCurve(point, tolerance)
        )
    }

    /**
     * 添加图形到组合中
     */
    public addGraph(graph: Graph): CombinedGraph {
        this.graphs.push(graph)
        return this
    }

    /**
     * 获取所有控制点
     */
    public get controlPoints(): Point3[] {
        const allPoints: Point3[] = []

        for (const graph of this.graphs) {
            if (graph.controlPoints instanceof Float32Array) {
                allPoints.push(
                    new Point3(
                        graph.controlPoints[0],
                        graph.controlPoints[1],
                        graph.controlPoints[2]
                    )
                )
                allPoints.push(
                    new Point3(
                        graph.controlPoints[-3],
                        graph.controlPoints[-2],
                        graph.controlPoints[-1]
                    )
                )
            } else {
                allPoints.push(...graph.controlPoints.map((p) => p.copy()))
            }
        }

        return allPoints
    }

    /**
     * CombinedGraph 的控制点是所有子图形控制点的聚合，不支持直接按索引编辑
     * 子类（如 Polygon）应 override 此方法实现具体逻辑
     */
    public setControlPoint(_index: number, _point: Point3): void {
        // no-op：CombinedGraph 本身不维护独立的控制点数组
    }

    public renderPath(ctx: CanvasRenderingContext2D, dependent: Boolean): void {

        dependent && ctx.beginPath()
        if (this.graphs.length === 0) {
            return
        }

        let lastEndPoint: Point3 | null = null
        let isFirstGraph = true

        for (let i = 0; i < this.graphs.length; i++) {
            const currentGraph = this.graphs[i]

            if (isFirstGraph) {
                // 第一个图形，直接渲染
                currentGraph.renderPath(ctx, true)
                lastEndPoint = this.getGraphEndPoint(currentGraph)
                isFirstGraph = false
            } else {
                // 获取当前图形的起始点
                const currentStartPoint = this.getGraphStartPoint(currentGraph)

                if (!lastEndPoint || !lastEndPoint.isSame(currentStartPoint))
                    return

                // 渲染当前图形的路径（不包含moveTo）
                this.renderGraphPathWithoutMoveTo(ctx, currentGraph)
                lastEndPoint = this.getGraphEndPoint(currentGraph)
            }
        }
    }
    /**
     * 渲染图形路径但不包含moveTo（避免路径分离）
     */
    private renderGraphPathWithoutMoveTo(
        ctx: CanvasRenderingContext2D,
        graph: Graph
    ): void {
        if (isGraphType(graph, GRAPHTYPE.LINE)) {
            // 对于线段，只使用lineTo
            ctx.lineTo(graph.endPoint.x, graph.endPoint.y)
        } else if (graph.type === GRAPHTYPE.BEZIER) {
            // 对于贝塞尔曲线，需要特殊处理
            const bezier = graph as any
            if (bezier.controlPoints.length === 3) {
                ctx.quadraticCurveTo(
                    bezier.controlPoints[1].x,
                    bezier.controlPoints[1].y,
                    bezier.endPoint.x,
                    bezier.endPoint.y
                )
            } else if (bezier.controlPoints.length === 4) {
                ctx.bezierCurveTo(
                    bezier.controlPoints[1].x,
                    bezier.controlPoints[1].y,
                    bezier.controlPoints[2].x,
                    bezier.controlPoints[2].y,
                    bezier.endPoint.x,
                    bezier.endPoint.y
                )
            }
        } else {
            // 其他类型，使用默认渲染
            graph.renderPath(ctx, false)
        }
    }

    /**
     * 获取图形的起始点
     */
    private getGraphStartPoint(graph: Graph): Point3 {
        if (graph.controlPoints instanceof Float32Array) {
            return new Point3(
                graph.controlPoints[0],
                graph.controlPoints[1],
                graph.controlPoints[2]
            )
        } else {
            return graph.controlPoints[0].copy()
        }
    }

    /**
     * 获取图形的结束点
     */
    private getGraphEndPoint(graph: Graph): Point3 {
        if (graph.controlPoints instanceof Float32Array) {
            const length = graph.controlPoints.length
            return new Point3(
                graph.controlPoints[length - 3],
                graph.controlPoints[length - 2],
                graph.controlPoints[length - 1]
            )
        } else {
            const points = graph.controlPoints
            return points[points.length - 1].copy()
        }
    }

    /**
     * 渲染组合图形
     */
    public render(ctx: CanvasRenderingContext2D): void {
        // 应用组合图形的样式
        ctx.save()
        const bounds = this.bounds
        this.style.applyToContext(ctx, bounds.width, bounds.height)
        for (const graph of this.graphs) {
            graph.render(ctx)
        }

        ctx.restore()
    }

    // ── 序列化 ──
    toJSON(): any {
        return {
            id: this.id,
            type: this.type,
            graphs: this.graphs.map(g => ({
                $type: g.type,
                $value: (g as any).toJSON(),
            })),
            style: this.style.toJSON(),
        }
    }

    /**
     * 从 JSON 数据重建 CombinedGraph。
     * 注意：data.graphs 中每个元素应已由 Serializer 递归解析为 Graph 实例。
     * 如果传入的是原始 JSON（包含 $type/$value），则需要通过 Serializer 先行反序列化。
     */
    static fromJSON(data: any): CombinedGraph {
        // data.graphs 应为已解析的 Graph 实例数组（由 Serializer 处理）
        const graphs: Graph[] = data.graphs ?? [];
        const cg = new CombinedGraph(
            graphs,
            data.style ? Style.fromJSON(data.style) : undefined,
        );
        cg.id = data.id;
        return cg;
    }

    /**
     * 复制组合图形
     */
    public copy(): this {
        const copiedGraphs = this.graphs.map((graph) => graph.copy())
        return new CombinedGraph(copiedGraphs, this.style.copy()) as this
    }

    /**
     * 批量添加图形
     */
    public addGraphs(graphs: Graph[]): CombinedGraph {
        this.graphs.push(...graphs)
        return this
    }

    /**
     * 按类型过滤图形
     */
    public getGraphsByType(type: GRAPHTYPE): Graph[] {
        return this.graphs.filter((graph) => graph.type === type)
    }

    /**
     * 应用变换矩阵到组合图形
     * 对所有子图形应用变换，支持递归处理嵌套的组合图形
     * @param matrix 变换矩阵
     * @returns 变换后的组合图形
     */
    public transform(matrix: Matrix4): CombinedGraph {
        for (const graph of this.graphs) {
            const transfromOrigin = graph.transfromOrigin
            graph.transfromOrigin = this.transfromOrigin.copy()
            graph.transform(matrix)
            graph.transfromOrigin = transfromOrigin
            graph.bounds = graph.updateBounds(
                graph.bounds.width > 0,
                graph.bounds.height > 0
            )
        }

        // 更新组合图形的边界框
        this.bounds = this.updateBounds()
        return this
    }

    /**
     * 计算与另一个图形的相交点
     * @param other 另一个图形
     * @returns 相交点数组
     */
    public intersect(other: Graph): Point3[] {
        const intersections = this.graphs.map((graph) => graph.intersect(other))
        return intersections.flat()
    }

    public resize(
        fixedPoint: Point3,
        dynamicPoint: Point3,
        resizeVector: Vector3
    ): void {
        for (const graph of this.graphs) {
            graph.resize(fixedPoint, dynamicPoint, resizeVector)
        }
        const referenceVector = dynamicPoint.subtract(fixedPoint)
        this.updateBounds(
            referenceVector.x - resizeVector.x > 0,
            referenceVector.y - resizeVector.y > 0
        )
    }
}

