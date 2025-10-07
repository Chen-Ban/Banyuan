import View, { ViewOptions } from './View'
import { Graph } from '../graph'
import { VIEWTYPE } from '@/constants'

// 图形视图选项接口
export interface GraphViewOptions extends Omit<ViewOptions, 'content'> {
    // 图形视图特有的选项可以在这里添加
}

/**
 * 图形视图 - 专门处理Graph类型内容
 */
export default class GraphView extends View {
    public type: VIEWTYPE = VIEWTYPE.GRAPHVIEW
    public content: Graph
    public children:View[] | null = null

    constructor(graph: Graph, options: GraphViewOptions = {}) {
        // 将graph作为content传递给父类构造函数
        super({ ...options})
        this.content = graph
        this.initBoundingBox()
        this.initViewport()
    }

    public renderContent(ctx: CanvasRenderingContext2D): void {
        if (this.content && typeof this.content.render === 'function') {
            this.content.render(ctx)
        }
    }

    public getContentBounds(): { x: number, y: number, width: number, height: number } {
        return this.content.getBounds()
    }

    public copy(): GraphView {
        const newView = new GraphView(this.content)
        
        // 复制基本属性
        newView.layer = this.layer
        newView.id = this.id
        newView.properties = { ...this.properties }
        newView.data = { ...this.data }
        newView.style = this.style.copy()
        newView.selected = this.selected
        newView.actived = this.actived
        newView.freezed = this.freezed
        newView.visible = this.visible
        newView.matrix = this.matrix.copy()

        // 复制插件
        if (this.viewport) {
            newView.viewport = { ...this.viewport }
        }
        if (this.controlPoints) {
            newView.controlPoints = { ...this.controlPoints }
        }
        if (this.boundingBox) {
            newView.boundingBox = { ...this.boundingBox }
        }

        return newView
    }
}
