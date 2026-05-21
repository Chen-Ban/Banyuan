import {
    Point3,
    ContainerView,
    Rectangle,
    Bounds,
} from '@banyuan/banvasgl'
import { FLOW_VIEWTYPE } from '../constants.js'
import type {
    INodeView,
    PortDirection,
    InteractResult,
    ContainerViewOptions,
} from '@banyuan/banvasgl'
import type { FlowNode } from '@banyuan/flow'
import PortView from './PortView.js'

// 节点默认尺寸
const NODE_DEFAULT_WIDTH  = 160
const NODE_DEFAULT_HEIGHT = 80
// 端口半径（与 PortView 保持一致）
const PORT_RADIUS = 8

export interface PortDefinition {
    id: string
    direction: PortDirection
    /** 在同侧端口列表中的顺序（0-based） */
    index?: number
}

export interface NodeViewOptions extends ContainerViewOptions {
    /** 节点的完整业务 schema（必传） */
    schema: FlowNode
    /** 覆盖自动推导的标题 */
    nodeTitle?: string
    /** 覆盖自动推导的端口定义 */
    ports?: PortDefinition[]
}

// ── 从 FlowNode 推导端口和标题 ──

function derivePortsFromSchema(schema: FlowNode): PortDefinition[] {
    const ports: PortDefinition[] = []
    const kind = schema.kind

    // 值节点：只有一个输出端口
    if (kind === 'variable' || kind === 'pageVar' || kind === 'eventParam') {
        ports.push({ id: `${schema.id}_out`, direction: 'output' })
        return ports
    }

    // 动作节点：至少一个输入 + 一个输出
    ports.push({ id: `${schema.id}_in`, direction: 'input' })

    if (kind === 'condition') {
        ports.push({ id: `${schema.id}_true`, direction: 'output' })
        ports.push({ id: `${schema.id}_false`, direction: 'output' })
    } else {
        ports.push({ id: `${schema.id}_out`, direction: 'output' })
    }

    return ports
}

function deriveTitleFromSchema(schema: FlowNode): string {
    switch (schema.kind) {
        case 'setData': return '设置数据'
        case 'setVisible': return '显隐控制'
        case 'navigate': return '跳转页面'
        case 'animate': return '播放动画'
        case 'dbQuery': return '数据库查询'
        case 'dbInsert': return '数据库插入'
        case 'dbUpdate': return '数据库更新'
        case 'dbDelete': return '数据库删除'
        case 'httpRequest': return 'HTTP 请求'
        case 'transform': return '数据转换'
        case 'script': return '自定义脚本'
        case 'condition': return '条件分支'
        case 'delay': return '延迟等待'
        case 'variable': return 'View 变量'
        case 'pageVar': return '页面变量'
        case 'eventParam': return '事件参数'
        case 'callFlow': return '调用流程'
        case 'setVariable': return '设置变量'
        default: return 'Node'
    }
}

/**
 * NodeView —— 流程图节点
 *
 * 渲染为圆角矩形 + 标题文字。
 * 构造时从 schema（FlowNode）自动推导端口和标题，
 * 也可通过 options 覆盖。
 *
 * schema 字段存储完整业务数据，属性面板可直接读写。
 * 坐标由 View.matrix 管理，不在 schema.x/y 中重复存储。
 *
 * interact 优先级：PortView child > BoundingBox > 节点内容
 */
export default class NodeView extends ContainerView implements INodeView {
    public readonly type = FLOW_VIEWTYPE.NODEVIEW
    public nodeTitle: string
    /** 完整的流程节点业务 schema */
    public schema: FlowNode

    constructor(options: NodeViewOptions) {
        const w = options.style?.width  ?? NODE_DEFAULT_WIDTH
        const h = options.style?.height ?? NODE_DEFAULT_HEIGHT

        super({
            ...options,
            id: options.schema.id,
            style: {
                width: w,
                height: h,
                overflow: 'visible',
                ...(options.style ?? {}),
            },
            content: new Rectangle(0, 0, w as number, h as number),
        })

        this.schema = options.schema
        this.nodeTitle = options.nodeTitle ?? deriveTitleFromSchema(options.schema)

        // 构造端口子节点并布局
        const ports = options.ports ?? derivePortsFromSchema(options.schema)
        if (ports.length > 0) {
            this._buildPorts(ports, w as number, h as number)
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
                // 垂直均匀分布：viewport 左上角定位，圆心在 viewport 中心 (PORT_RADIUS, PORT_RADIUS)
                const yStep = nodeH / (count + 1)
                const y = yStep * (i + 1) - PORT_RADIUS
                // 让圆心（viewport 中心）贴在节点边缘中点
                const x = side === 'left'
                    ? -PORT_RADIUS            // 圆心 = x + PORT_RADIUS = 0，落在左边缘
                    : nodeW - PORT_RADIUS     // 圆心 = x + PORT_RADIUS = nodeW，落在右边缘

                port.translate(x, y, 0)
                this.addChild(port)
            })
        }

        layoutPorts(inputPorts,  'left')
        layoutPorts(outputPorts, 'right')
    }

    /**
     * override interact：PortView child 优先于 BoundingBox
     */
    public interact(worldPoint: Point3, bufferCtx?: CanvasRenderingContext2D): InteractResult {
        const relativePoint = this.getMVPMatrix().inverse().multiply(worldPoint)

        // 1. 先检查 PortView children（端口优先级最高）
        const scrolledPoint = new Point3(
            relativePoint.x - this.scrollOffset.x,
            relativePoint.y - this.scrollOffset.y,
            relativePoint.z,
        )
        const adjustedWorldPoint = this.getMVPMatrix().multiply(scrolledPoint)

        for (const child of this.children) {
            const childResult = child.interact(adjustedWorldPoint, bufferCtx)
            if (childResult.view && childResult.content && childResult.extraData) {
                return childResult
            }
        }

        // 2. BoundingBox 插件
        const pluginsResult = this.interactPlugins(relativePoint, bufferCtx)
        if (pluginsResult.view) return pluginsResult

        // 3. 节点自身内容
        const contentResult = this.interactContent(scrolledPoint, bufferCtx)
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
            schema: { ...this.schema },
            nodeTitle: this.nodeTitle,
            style: { ...this.style },
            matrix: this.matrix.copy(),
        })
    }

    public layoutContent(): Bounds {
        return this.content?.bounds ?? Bounds.empty()
    }
}
