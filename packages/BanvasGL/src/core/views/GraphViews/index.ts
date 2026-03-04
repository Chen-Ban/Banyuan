import View, { InteractResult, ViewOptions } from '../View/View'
import { Graph, isArc, isCubicBezier, isLine } from '../../graph'
import { VIEWTYPE } from '@/core/constants'
import { Point3 } from '../../math'
import { VertexAddonImpl, ViewAddonImpl } from '../addon'
import { ExtraData, InteractionMapBuilder } from '../View/InteractionMapBuilder'

// 图形视图选项接口
export interface GraphViewOptions extends Omit<ViewOptions, 'content'> {
    // 图形视图特有的选项可以在这里添加
}

/**
 * 图形视图 - 专门处理Graph类型内容
 */
export default class GraphView extends View {
    public type: VIEWTYPE = VIEWTYPE.GRAPHVIEW
    public content: [Graph]
    public controlPoints: VertexAddonImpl[] | null = null

    constructor(graph: Graph, options: GraphViewOptions = {}) {
        // 将graph作为content传递给父类构造函数
        super({ ...options })
        this.content = [graph]

        // TOREVIEW: 多个插件的展示、交互、优先级是怎么样的
        if (
            isLine(graph) ||
            isCubicBezier(graph) ||
            isCubicBezier(graph) ||
            isArc(graph)
        ) {
            this.boundingBox = null
        }

        // graph独有的控制点插件
        this.controlPoints = this.content.map((graph) => {
            const vertics =
                graph.controlPoints instanceof Float32Array
                    ? Point3.fromArray(graph.controlPoints)
                    : graph.controlPoints
            return new VertexAddonImpl(vertics)
        })
    }

    protected interactPlugins(relativePoint: Point3): InteractResult {
        const builder = new InteractionMapBuilder()
        if (this.actived) {
            this.controlPoints?.forEach((addon: ViewAddonImpl, i: number) => {
                const data = addon.interact(relativePoint)
                if (data && this.controlPoints) {
                    builder.add(this, this.controlPoints[i], data)
                }
            })
        }
        return builder.build()
    }

    public renderPlugins(ctx: CanvasRenderingContext2D): void {
        super.renderPlugins(ctx)
        this.controlPoints?.map((addon) => addon.render(ctx))
    }

    public copy(): GraphView {
        const newView = new GraphView(this.content[0])

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
            newView.controlPoints = this.controlPoints.map((addon) =>
                addon.copy()
            )
        }
        if (this.boundingBox) {
            newView.boundingBox = this.boundingBox.copy()
        }

        return newView
    }
}

export function isGraphView(view: any): view is GraphView {
    return view instanceof GraphView
}
