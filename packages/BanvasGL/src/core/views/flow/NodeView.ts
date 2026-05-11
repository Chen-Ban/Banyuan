import { VIEWTYPE } from '@/core/constants'
import { INodeView } from '@/core/interfaces'
import { Point3 } from '@/core/math'
import View, { InteractResult, ViewOptions } from '@/core/views/View/View'
import { Rectangle } from '@/core/graph'
import Bounds from '@/core/graph/base/Bounds'
import PortView from './PortView'
import type { PortDirection } from '@/core/interfaces'

// 节点默认尺寸
const NODE_DEFAULT_WIDTH  = 160
const NODE_DEFAULT_HEIGHT = 80
// 端口偏移（相对于节点边缘，向外突出半个端口直径）
const PORT_RADIUS = 8
const PORT_DIAMETER = PORT_RADIUS * 2

export interface PortDefinition {
    id: string
    direction: PortDirection
    /** 在同侧端口列表中的顺序（0-based） */
    index?: number
}

export interface NodeViewOptions extends ViewOptions {
    nodeTitle?: string
    ports?: PortDefinition[]
}

/**
 * NodeView —— 流程图节点
 *
 * 渲染为圆角矩形 + 标题文字。
 * 构造时根据 ports 定义自动创建 PortView 子节点，
 * input 端口排左侧，output 端口排右侧，bidirectional 排右侧。
 *
 * interact 优先级：PortView child > BoundingBox > 节点内容
 */
export default class NodeView extends View implements INodeView {
    public readonly type = VIEWTYPE.NODEVIEW
    public nodeTitle: string

    constructor(options: NodeViewOptions) {
        const w = options.style?.width  ?? NODE_DEFAULT_WIDTH
        const h = options.style?.height ?? NODE_DEFAULT_HEIGHT

        super({
            ...options,
            style: {
                width: w,
                height: h,
                overflow: 'visible',
                ...(options.style ?? {}),
            },
            content: new Rectangle(0, 0, w as number, h as number),
        })

        this.nodeTitle = options.nodeTitle ?? 'Node'

        // 构造端口子节点并布局
        if (options.ports && options.ports.length > 0) {
            this._buildPorts(options.ports, w as number, h as number)
        }
    }

    /**
     * 根据端口定义创建 PortView 并设置位置
     */
    private _buildPorts(ports: PortDefinition[], nodeW: number, nodeH: number): void {
        const inputPorts  = ports.filter(p => p.direction === 'input')
        const outputPorts = ports.filter(p => p.direction !== 'input')

        const layoutPorts = (list: PortDefinition[], side: 'left' | 'right') => {
            const count = list.length
            list.forEach((def, i) => {
                const port = new PortView({
                    id: def.id,
                    portDirection: def.direction,
                })
                // 垂直均匀分布
                const yStep = nodeH / (count + 1)
                const y = yStep * (i + 1) - PORT_RADIUS
                // 左侧端口中心贴节点左边缘，右侧贴右边缘
                const x = side === 'left'
                    ? -PORT_DIAMETER          // 向左突出一个直径
                    : nodeW                   // 向右突出

                port.translate(x, y, 0)
                port.parent = this
                this.children.push(port)
            })
        }

        layoutPorts(inputPorts,  'left')
        layoutPorts(outputPorts, 'right')
    }

    /**
     * override interact：PortView child 优先于 BoundingBox
     */
    public interact(worldPoint: Point3): InteractResult {
        const relativePoint = this.getMVPMatrix().inverse().multiply(worldPoint)

        // 1. 先检查 PortView children（端口优先级最高）
        const scrolledPoint = new Point3(
            relativePoint.x - this.scrollOffset.x,
            relativePoint.y - this.scrollOffset.y,
            relativePoint.z,
        )
        const adjustedWorldPoint = this.getMVPMatrix().multiply(scrolledPoint)

        for (const child of this.children) {
            const childResult = child.interact(adjustedWorldPoint)
            if (childResult.view && childResult.content && childResult.extraData) {
                return childResult
            }
        }

        // 2. BoundingBox 插件
        const pluginsResult = this.interactPlugins(relativePoint)
        if (pluginsResult.view) return pluginsResult

        // 3. 节点自身内容
        const contentResult = this.interactContent(scrolledPoint)
        if (contentResult.view) return contentResult

        return { view: null, content: null, extraData: null }
    }

    /**
     * 渲染：圆角矩形背景 + 标题文字
     */
    public renderContent(ctx: CanvasRenderingContext2D): void {
        const vp = this.viewport
        const w = vp.width
        const h = vp.height
        const r = 8  // 圆角半径

        ctx.save()

        // 圆角矩形背景
        ctx.beginPath()
        ctx.moveTo(r, 0)
        ctx.lineTo(w - r, 0)
        ctx.quadraticCurveTo(w, 0, w, r)
        ctx.lineTo(w, h - r)
        ctx.quadraticCurveTo(w, h, w - r, h)
        ctx.lineTo(r, h)
        ctx.quadraticCurveTo(0, h, 0, h - r)
        ctx.lineTo(0, r)
        ctx.quadraticCurveTo(0, 0, r, 0)
        ctx.closePath()

        ctx.fillStyle = this.actived ? '#eff6ff' : '#ffffff'
        ctx.fill()
        ctx.strokeStyle = this.actived ? '#3b82f6' : '#d1d5db'
        ctx.lineWidth = this.actived ? 2 : 1
        ctx.stroke()

        // 标题文字
        ctx.fillStyle = '#111827'
        ctx.font = '13px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(this.nodeTitle, w / 2, h / 2, w - 16)

        ctx.restore()
    }

    public copy(): NodeView {
        return new NodeView({
            id: this.id,
            nodeTitle: this.nodeTitle,
            style: { ...this.style },
            matrix: this.matrix.copy(),
        })
    }

    public layoutContent(): Bounds {
        return this.content?.bounds ?? Bounds.empty()
    }
}
