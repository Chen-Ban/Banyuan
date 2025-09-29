import { GRAPHTYPE } from "@/constants"
import Style from "@/core/style/Style"
import { Point3 } from "@/core/math"
import Graph, { GraphOptions } from "../base/Graph"
import Bounds from "../base/Bounds"

/**
 * CombinedGraph类 - 组合多个图形元素的复合图形
 * 可以包含多个子图形，统一管理和渲染
 */
export default class CombinedGraph extends Graph {
    public type: GRAPHTYPE = GRAPHTYPE.COMBINED_GRAPH
    public graphs: Graph[] = []
    public style: Style

    constructor(graphs: Graph[] = [], style?: Style, options?: GraphOptions) {
        super(options)
        this.graphs = [...graphs]
        this.style = style || new Style()
        
        // 在构造函数中立即计算边界框，确保View能获取到正确的初始尺寸
        this.setBounds(this.calculateBounds())
    }

    /**
     * 计算组合图形的包围盒
     */
    protected calculateBounds(): Bounds {
        if (this.graphs.length === 0) {
            return Bounds.empty()
        }

        // 计算所有子图形的包围盒
        const bounds = this.graphs.map(graph => graph.getBounds())
        return Bounds.union(...bounds)
    }

    /**
     * 添加图形到组合中
     */
    public addGraph(graph: Graph): CombinedGraph {
        this.graphs.push(graph)
        this.invalidateBounds()
        return this
    }

    /**
     * 移除指定图形
     */
    public removeGraph(graphId: string): CombinedGraph {
        this.graphs = this.graphs.filter(graph => graph.id !== graphId)
        this.invalidateBounds()
        return this
    }

    /**
     * 获取指定ID的图形
     */
    public getGraph(graphId: string): Graph | undefined {
        return this.graphs.find(graph => graph.id === graphId)
    }

    /**
     * 清空所有图形
     */
    public clearGraphs(): CombinedGraph {
        this.graphs = []
        this.invalidateBounds()
        return this
    }

    /**
     * 获取图形数量
     */
    public getGraphCount(): number {
        return this.graphs.length
    }


    /**
     * 获取所有控制点
     */
    public get controlPoints(): Point3[] {
        const allPoints: Point3[] = []
        
        for (const graph of this.graphs) {
            if (graph.controlPoints instanceof Float32Array) {
                for (let i = 0; i < graph.controlPoints.length; i += 3) {
                    allPoints.push(new Point3(
                        graph.controlPoints[i],
                        graph.controlPoints[i + 1],
                        graph.controlPoints[i + 2]
                    ))
                }
            } else {
                allPoints.push(...graph.controlPoints.map(p => p.copy()))
            }
        }
        
        return allPoints
    }

    /**
     * 渲染组合图形
     */
    public render(ctx: CanvasRenderingContext2D): void {
        // 应用组合图形的样式
        const bounds = this.getBounds()
        this.style.applyToContext(ctx, bounds.width, bounds.height)
        
        // 渲染所有子图形
        for (const graph of this.graphs) {
            graph.render(ctx)
        }
    }

    /**
     * 复制组合图形
     */
    public copy(): CombinedGraph {
        const copiedGraphs = this.graphs.map(graph => graph.copy())
        return new CombinedGraph(copiedGraphs, this.style.copy())
    }

    /**
     * 设置样式
     */
    public setStyle(style: Style): CombinedGraph {
        this.style = style
        return this
    }

    /**
     * 批量添加图形
     */
    public addGraphs(graphs: Graph[]): CombinedGraph {
        this.graphs.push(...graphs)
        this.invalidateBounds()
        return this
    }

    /**
     * 检查是否包含指定图形
     */
    public containsGraph(graphId: string): boolean {
        return this.graphs.some(graph => graph.id === graphId)
    }

    /**
     * 获取所有图形的ID列表
     */
    public getGraphIds(): string[] {
        return this.graphs.map(graph => graph.id)
    }

    /**
     * 按类型过滤图形
     */
    public getGraphsByType(type: GRAPHTYPE): Graph[] {
        return this.graphs.filter(graph => graph.type === type)
    }

    /**
     * 获取组合图形的中心点
     */
    public getCenter(): Point3 {
        if (this.graphs.length === 0) {
            return new Point3(0, 0, 0)
        }

        const allPoints = this.controlPoints
        if (allPoints.length === 0) {
            return new Point3(0, 0, 0)
        }

        const sumX = allPoints.reduce((sum, point) => sum + point.x, 0)
        const sumY = allPoints.reduce((sum, point) => sum + point.y, 0)
        const sumZ = allPoints.reduce((sum, point) => sum + point.z, 0)

        return new Point3(
            sumX / allPoints.length,
            sumY / allPoints.length,
            sumZ / allPoints.length
        )
    }
}
