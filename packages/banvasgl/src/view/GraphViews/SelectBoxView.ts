import GraphView from './index'
import { Rectangle } from '@/graph'
import { ViewType } from '@/foundation/constants'
import { generateId, generateName } from '@/foundation/utils'
import { Point3 } from '@/foundation/math'
import { Color, FillStyle, StrokeStyle, Style } from '@/foundation/style'
import { ISelectBoxView } from '@/types'
import type { ISelectBoxViewOptions } from '@/types'
/**
 * 框选视图 - 专门用于矩形框选操作
 * 继承自 GraphView，但具有特殊的类型标识，不参与交互
 */

/** SelectBox 专用渲染样式（框选矩形） */
const SELECTION_STYLE = new Style({
    fillStyle: FillStyle.fromRGBA(0, 0, 144, 0.1),
    strokeStyle: StrokeStyle.dashed(new Color(100, 150, 255, 0.8), 1, [5, 5]),
})

export default class SelectBoxView extends GraphView implements ISelectBoxView {
    public type: ViewType = ViewType.SELECTBOXVIEW

    constructor(options: ISelectBoxViewOptions = {}) {
        const selectionRect = new Rectangle(0, 0, 0, 0)

        super(selectionRect, options)
        this.id = options.id || generateId(this.type)
        this.name = options.name || generateName(this.type)
        // 框选视图不应该被激活或选中
        this.actived = false
        this.selected = false
        this.freezed = true // 冻结框选视图，防止被操作
    }

    /**
     * 重写渲染内容，使用 SelectBox 专用样式
     */
    public override renderContent(ctx: CanvasRenderingContext2D): void {
        this.content?.render(ctx, SELECTION_STYLE)
    }

    /**
     * 框选视图不参与交互
     */
    public interact(): {
        view: null
        content: null
        extraData: null
    } {
        return {
            view: null,
            content: null,
            extraData: null,
        }
    }

    /**
     * 更新框选矩形的位置和大小
     * @param anchorPoint 锚点（起始点）
     * @param dynamicPoint 动态点（当前鼠标位置）
     */
    public updateSelect(anchorPoint: Point3, dynamicPoint: Point3): void {
        const minX = Math.min(anchorPoint.x, dynamicPoint.x)
        const minY = Math.min(anchorPoint.y, dynamicPoint.y)
        const maxX = Math.max(anchorPoint.x, dynamicPoint.x)
        const maxY = Math.max(anchorPoint.y, dynamicPoint.y)
        const width = maxX - minX
        const height = maxY - minY

        const rectGraph = this.content as Rectangle
        rectGraph.setPosition(minX, minY)
        rectGraph.setSize(width, height)
    }

    public copy(): SelectBoxView {
        const newView = new SelectBoxView()

        // 复制基本属性（id 由构造器自动生成新的）
        newView.data = { ...this.data }
        newView.style = {
            ...this.style,
        }
        newView.selected = this.selected
        newView.actived = this.actived
        newView.freezed = this.freezed
        newView.visible = this.visible
        newView.matrix = this.matrix.copy()

        // 复制内容（矩形）
        const rectGraph = this.content as Rectangle
        const newRectGraph = newView.content as Rectangle
        const topLeft = rectGraph.getTopLeft()
        newRectGraph.setPosition(topLeft.x, topLeft.y)
        newRectGraph.setSize(rectGraph.width, rectGraph.height)

        // 复制插件
        if (this.viewport) {
            newView.viewport = this.viewport.copy()
        }
        if (this.boundingBox) {
            newView.boundingBox = this.boundingBox.copy()
        }
        if (this.decoration) {
            newView.decoration = this.decoration.copy()
        }

        return newView
    }
}

