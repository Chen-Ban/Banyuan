import Point3 from '@/foundation/math/Point3.js'
import { ViewType } from '@/foundation/constants.js'
import ContainerView from '@/view/ContainerView/index.js'
import Rectangle from '@/graph/combined/Polygon/Rectangle.js'
import Bounds from '@/graph/base/Bounds.js'
import PortView from './PortView.js'
import type {
    INodeView,
    PortDirection,
    IInteractResult,
    IContainerViewOptions,
    FlowNode,
} from '@/types/index.js'

// 节点默认尺寸
const NODE_DEFAULT_WIDTH  = 160
const NODE_DEFAULT_HEIGHT = 80
// 端口半径（与 PortView 保持一致）
const PORT_RADIUS = 8

// ── 节点外观策略 ──

type NodeShape = 'rect' | 'diamond' | 'pill'

interface NodeAppearance {
    shape: NodeShape
    /** 左侧色条颜色（仅 rect shape 适用） */
    accentColor: string
    /** 图标 emoji（简单替代 SVG 图标） */
    icon: string
}

function deriveAppearance(kind: FlowNode['kind']): NodeAppearance {
    switch (kind) {
        // 条件分支 → 菱形
        case 'condition':
            return { shape: 'diamond', accentColor: '#f59e0b', icon: '⟋' }

        // 值节点 → 胶囊形（pill）
        case 'variable':
        case 'pageVar':
        case 'eventParam':
            return { shape: 'pill', accentColor: '#8b5cf6', icon: '◈' }

        // 前端动作节点 → 蓝色色条
        case 'setData':
            return { shape: 'rect', accentColor: '#3b82f6', icon: '✎' }
        case 'setVisible':
            return { shape: 'rect', accentColor: '#3b82f6', icon: '👁' }
        case 'navigate':
            return { shape: 'rect', accentColor: '#3b82f6', icon: '→' }
        case 'animate':
            return { shape: 'rect', accentColor: '#3b82f6', icon: '▶' }

        // 后端数据库节点 → 绿色色条
        case 'dbQuery':
        case 'dbInsert':
        case 'dbUpdate':
        case 'dbDelete':
            return { shape: 'rect', accentColor: '#10b981', icon: '⬡' }

        // 后端网络/计算节点 → 橙色色条
        case 'httpRequest':
            return { shape: 'rect', accentColor: '#f97316', icon: '⇄' }
        case 'transform':
            return { shape: 'rect', accentColor: '#f97316', icon: '⇌' }
        case 'script':
            return { shape: 'rect', accentColor: '#f97316', icon: '</>' }

        // 流程控制节点 → 灰色色条
        case 'delay':
            return { shape: 'rect', accentColor: '#6b7280', icon: '⏱' }
        case 'setVariable':
            return { shape: 'rect', accentColor: '#6b7280', icon: '≔' }
        case 'callFlow':
            return { shape: 'rect', accentColor: '#6366f1', icon: '⎇' }
        case 'subFlow':
            return { shape: 'rect', accentColor: '#6366f1', icon: '⊞' }

        default:
            return { shape: 'rect', accentColor: '#d1d5db', icon: '●' }
    }
}

export interface PortDefinition {
    id: string
    direction: PortDirection
    /** 在同侧端口列表中的顺序（0-based） */
    index?: number
    /** 该端口允许的最大连线数（默认 1） */
    maxConnections?: number
}

export interface NodeViewOptions extends IContainerViewOptions {
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

    // 值节点：只有一个输出端口（可被多条边引用）
    if (kind === 'variable' || kind === 'pageVar' || kind === 'eventParam') {
        ports.push({ id: `${schema.id}_out`, direction: 'output', maxConnections: Infinity })
        return ports
    }

    // subFlow 节点：根据 inputs/outputs 动态推导端口
    if (kind === 'subFlow') {
        // 控制流输入端口（固定 1 个）
        ports.push({ id: `${schema.id}_in`, direction: 'input' })
        // 数据输入端口（每个 input 一个）
        for (const input of schema.inputs) {
            ports.push({ id: `${schema.id}_param_${input.name}`, direction: 'input' })
        }
        // 控制流输出端口（固定 1 个）
        ports.push({ id: `${schema.id}_out`, direction: 'output' })
        // 数据输出端口（每个 output 一个）
        for (const output of schema.outputs) {
            ports.push({ id: `${schema.id}_result_${output.name}`, direction: 'output' })
        }
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
        case 'subFlow': return (schema as { name?: string }).name || '子流程'
        default: return 'Node'
    }
}

/**
 * NodeView —— 流程图节点
 *
 * 根据节点 kind 采用不同形状策略：
 * - condition → 菱形（diamond）
 * - variable / pageVar / eventParam → 胶囊形（pill）
 * - 其他动作节点 → 圆角矩形 + 左侧色条（rect）
 *
 * 构造时从 schema（FlowNode）自动推导端口和标题，
 * 也可通过 options 覆盖。
 *
 * schema 字段存储完整业务数据，属性面板可直接读写。
 * 坐标由 View.matrix 管理，不在 schema.x/y 中重复存储。
 *
 * interact 优先级：PortView child > BoundingBox > 节点内容
 */
export default class NodeView extends ContainerView implements INodeView {
    public readonly type = ViewType.NODEVIEW
    public nodeTitle: string
    /** 完整的流程节点业务 schema */
    public schema: FlowNode
    /** 节点外观策略（由 kind 推导） */
    private appearance: NodeAppearance

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
        this.appearance = deriveAppearance(options.schema.kind)

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
                    maxConnections: def.maxConnections,
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
    public interact(worldPoint: Point3, bufferCtx?: CanvasRenderingContext2D): IInteractResult {
        const relativePoint = this.getMVPMatrix().inverse().multiply(worldPoint)

        // 1. 先检查 PortView children（端口优先级最高）
        const scrollOffset = this.decoration?.computedStyle.scrollOffset ?? { x: 0, y: 0 }
        const scrolledPoint = new Point3(
            relativePoint.x - scrollOffset.x,
            relativePoint.y - scrollOffset.y,
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
     * 渲染：根据 shape 策略选择不同绘制方式
     */
    public renderContent(ctx: CanvasRenderingContext2D): void {
        const { shape } = this.appearance
        if (shape === 'diamond') {
            this._renderDiamond(ctx)
        } else if (shape === 'pill') {
            this._renderPill(ctx)
        } else {
            this._renderRect(ctx)
        }
    }

    /** 圆角矩形 + 左侧色条（普通动作节点） */
    private _renderRect(ctx: CanvasRenderingContext2D): void {
        const vp = this.viewport
        const w = vp.width
        const h = vp.height
        const r = 6      // 圆角半径
        const accentW = 4 // 左侧色条宽度

        ctx.save()

        const isActive = this.actived
        const fillColor  = isActive ? '#eff6ff' : '#ffffff'
        const strokeColor = isActive ? '#3b82f6' : '#e5e7eb'
        const lineWidth = isActive ? 2 : 1

        // 外部圆角矩形（包含阴影）
        ctx.shadowColor = 'rgba(0,0,0,0.08)'
        ctx.shadowBlur = isActive ? 0 : 4
        ctx.shadowOffsetY = isActive ? 0 : 1

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

        ctx.fillStyle = fillColor
        ctx.fill()
        ctx.shadowColor = 'transparent'
        ctx.strokeStyle = strokeColor
        ctx.lineWidth = lineWidth
        ctx.stroke()

        // 左侧色条（裁剪到圆角矩形内）
        ctx.save()
        ctx.clip()
        ctx.fillStyle = this.appearance.accentColor
        ctx.fillRect(0, 0, accentW, h)
        ctx.restore()

        // 图标
        const icon = this.appearance.icon
        const iconX = accentW + 10
        const iconY = h / 2
        ctx.fillStyle = this.appearance.accentColor
        ctx.font = '14px sans-serif'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText(icon, iconX, iconY)

        // 标题文字
        const textX = accentW + 28
        const maxTextW = w - textX - 8
        ctx.fillStyle = isActive ? '#1d4ed8' : '#111827'
        ctx.font = '12px sans-serif'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText(this.nodeTitle, textX, iconY, maxTextW)

        ctx.restore()
    }

    /** 菱形（condition 节点） */
    private _renderDiamond(ctx: CanvasRenderingContext2D): void {
        const vp = this.viewport
        const w = vp.width
        const h = vp.height
        const cx = w / 2
        const cy = h / 2

        ctx.save()

        const isActive = this.actived

        // 菱形路径
        ctx.beginPath()
        ctx.moveTo(cx, 0)          // 上顶点
        ctx.lineTo(w, cy)          // 右顶点
        ctx.lineTo(cx, h)          // 下顶点
        ctx.lineTo(0, cy)          // 左顶点
        ctx.closePath()

        // 阴影
        ctx.shadowColor = 'rgba(0,0,0,0.1)'
        ctx.shadowBlur = isActive ? 0 : 4
        ctx.shadowOffsetY = isActive ? 0 : 1

        ctx.fillStyle = isActive ? '#fef3c7' : '#fffbeb'
        ctx.fill()
        ctx.shadowColor = 'transparent'
        ctx.strokeStyle = isActive ? '#f59e0b' : '#fcd34d'
        ctx.lineWidth = isActive ? 2 : 1.5
        ctx.stroke()

        // 图标（上半部分居中）
        ctx.fillStyle = '#d97706'
        ctx.font = 'bold 13px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('?', cx, cy - 8)

        // 标题文字（下半部分居中）
        ctx.fillStyle = isActive ? '#92400e' : '#374151'
        ctx.font = '11px sans-serif'
        ctx.textBaseline = 'middle'
        ctx.fillText(this.nodeTitle, cx, cy + 9, w * 0.65)

        ctx.restore()
    }

    /** 胶囊形（值节点） */
    private _renderPill(ctx: CanvasRenderingContext2D): void {
        const vp = this.viewport
        const w = vp.width
        const h = vp.height
        const r = h / 2  // 完全圆角 → 胶囊

        ctx.save()

        const isActive = this.actived

        ctx.shadowColor = 'rgba(0,0,0,0.08)'
        ctx.shadowBlur = isActive ? 0 : 3
        ctx.shadowOffsetY = isActive ? 0 : 1

        ctx.beginPath()
        ctx.moveTo(r, 0)
        ctx.lineTo(w - r, 0)
        ctx.arc(w - r, r, r, -Math.PI / 2, Math.PI / 2)
        ctx.lineTo(r, h)
        ctx.arc(r, r, r, Math.PI / 2, -Math.PI / 2)
        ctx.closePath()

        ctx.fillStyle = isActive ? '#ede9fe' : '#f5f3ff'
        ctx.fill()
        ctx.shadowColor = 'transparent'
        ctx.strokeStyle = isActive ? '#8b5cf6' : '#c4b5fd'
        ctx.lineWidth = isActive ? 2 : 1
        ctx.stroke()

        // 图标
        ctx.fillStyle = '#7c3aed'
        ctx.font = '12px sans-serif'
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
