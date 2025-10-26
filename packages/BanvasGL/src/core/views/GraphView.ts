import View, { ViewOptions, ViewContent } from './View'
import { Graph, Line, Rectangle } from '../graph'
import { VIEWTYPE } from '@/constants'
import { Point3 } from '../math'
import { ViewAddonImpl } from './addon'
import { world2Relative } from '@/utils/utils'
import { getGlobalCanvasContext } from '../renderer/CanvasContext'
import { InteractionResult, InteractionResultBuilder } from './addon'

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

    public interact(p: Point3): { view: View | null, content: ViewContent | ViewAddonImpl | null } {
        const relativePoint = world2Relative(p, this.matrix)
        const builder = new InteractionResultBuilder()
        
        
        const ctx = getGlobalCanvasContext()?.getBufferContext()
        if (!ctx) throw new Error("交互失败")
        
        // 检查控制点
        if (this.actived && this.controlPoints) {
            const hitCP = this.controlPoints.vertices.some(v => v.subtract(relativePoint).length < 5)
            if (hitCP) {
                
                return builder.add(this, this.controlPoints).build()
            }
        }
        
        // 检查内容
        if (this.content) {
            const hitContent = this.content.isPointInPath(ctx, relativePoint)
            if (hitContent) {
                return builder.add(this, this.content).build()
            }
        }
        
        // 检查边界框
        if (this.actived && this.boundingBox) {
            const isMoving = this.boundingBox.region.graphs.some(edge => edge.distanceToPoint(relativePoint) < 5)
            const isResizing = this.boundingBox.handles.some(rec => rec.graphs.some(edge =>edge.distanceToPoint(relativePoint) < 5))
            if (isMoving || isResizing) {
                return builder.add(this, this.boundingBox).build()
            }
        }
        
        return builder.build()
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
            newView.viewport = this.viewport.copy()
        }
        if (this.controlPoints) {
            newView.controlPoints = this.controlPoints.copy()
        }
        if (this.boundingBox) {
            newView.boundingBox =this.boundingBox.copy()
        }

        return newView
    }
}
