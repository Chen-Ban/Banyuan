import View, { InteractResult, ViewOptions } from '@/core/views/View/View'
import { Graph, Line } from '@/core/graph'
import { isGraphType, isAnalyticGraph, ExtraData, IGraphView, ISerializable } from '@/core/interfaces'
import { VIEWTYPE } from '@/core/constants'
import { Point3 } from '@/core/math'
import { VertexAddon } from '@/core/views/addon'
import Matrix4 from '@/core/math/Matrix4'
import Bounds from '@/core/graph/base/Bounds'

// 图形视图选项接口
export interface GraphViewOptions extends Omit<ViewOptions, 'content'> {
    // 图形视图特有的选项可以在这里添加
}

/**
 * 图形视图 - 专门处理Graph类型内容
 */
export default class GraphView extends View implements IGraphView, ISerializable {
    public type: VIEWTYPE = VIEWTYPE.GRAPHVIEW
    public content: Graph
    public controlPoints: VertexAddon | null = null

    constructor(graph: Graph, options: GraphViewOptions = {}) {
        // 将graph作为content传递给父类构造函数
        super({ ...options })
        this.content = graph

        // TOREVIEW: 多个插件的展示、交互、优先级是怎么样的
        if (isAnalyticGraph(graph)) {
            this.boundingBox = null
        }

        // graph独有的控制点插件
        const vertics =
            this.content.controlPoints instanceof Float32Array
                ? Point3.fromArray(this.content.controlPoints)
                : this.content.controlPoints
        this.controlPoints = new VertexAddon(vertics)
    }

    protected interactPlugins(relativePoint: Point3): InteractResult {
        // BoundingBox 优先（来自基类）
        const baseResult = super.interactPlugins(relativePoint)
        if (baseResult.view) return baseResult

        // VertexAddon（控制点编辑）
        if (this.actived && this.controlPoints) {
            const data = this.controlPoints.interact(relativePoint)
            if (data) {
                return { view: this, content: this.controlPoints, extraData: data }
            }
        }
        return { view: null, content: null, extraData: null }
    }

    public renderPlugins(ctx: CanvasRenderingContext2D): void {
        super.renderPlugins(ctx)
        this.controlPoints?.render(ctx)
    }

    public getSnapObjects(): [Point3[], Line[]] {
        const [points, lines] = super.getSnapObjects()
        const mvpInverse = this.getMVPMatrix().inverse()
        let controlPoints = this.content.controlPoints
        if (controlPoints instanceof Float32Array) {
            controlPoints = Point3.fromArray(controlPoints)
        }
        return [
            [...points, ...controlPoints.map((p) => mvpInverse.multiply(p))],
            lines,
        ]
    }

    public copy(): GraphView {
        const newView = new GraphView(this.content)

        // 复制基本属性
        newView.layer = this.layer
        newView.id = this.id
        newView.properties = { ...this.properties }
        newView.data = { ...this.data }
        newView.style = {
            ...this.style,
        }
        newView.selected = this.selected
        newView.actived = this.actived
        newView.freezed = this.freezed
        newView.visible = this.visible
        newView.matrix = this.matrix.copy()

        // 复制插件
        if (this.viewport) {
            newView.viewport = this.viewport.copy()
        }
        if (this.controlPoints) {
            newView.controlPoints = this.controlPoints.copy()
        }
        if (this.boundingBox) {
            newView.boundingBox = this.boundingBox.copy()
        }

        return newView
    }

    // ==================== 序列化 ====================

    /**
     * 从纯数据对象恢复 GraphView 实例。
     * data.content 应由 Serializer 预先解析为 Graph 实例后传入。
     */
    static fromJSON(data: any): GraphView {
        const view = new GraphView(data.content)
        view.id = data.id
        view.layer = data.layer
        view.visible = data.visible
        view.freezed = data.freezed
        if (data.properties) view.properties = data.properties
        if (data.data) view.data = data.data
        if (data.style) view.style = data.style
        if (data.matrix) view.matrix = Matrix4.fromJSON(data.matrix)
        if (data.viewport) view.viewport = Bounds.fromJSON(data.viewport)
        if (data.children) {
            data.children.forEach((child: View) => {
                view.children.push(child)
                child.parent = view
                child.onAttach()
            })
        }
        return view
    }
}

