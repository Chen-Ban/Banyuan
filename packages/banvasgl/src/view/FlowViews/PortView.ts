import { Action, Cursor, ViewType } from '@/foundation/constants.js'
import View from '@/view/View/View.js'
import Circle from '@/graph/analytic/Circle.js'
import Point3 from '@/foundation/math/Point3.js'
import Bounds from '@/graph/base/Bounds.js'
import type {
    IPortView,
    PortDirection,
    IInteractResult,
    IViewOptions,
} from '@/types/index.js'
import type { IDrawingContext } from '@/types/platform/context.js'

// 端口圆形半径（逻辑像素）
const PORT_RADIUS = 8

export interface PortViewOptions extends IViewOptions {
    portDirection: PortDirection
    /** 该端口允许的最大连线数（默认 1，Infinity 表示无限制） */
    maxConnections?: number
    /** 端口在节点上的索引（condition 多分支时使用） */
    portIndex?: number
}

/**
 * PortView —— 流程节点的连接端口
 *
 * 渲染为一个圆形，命中时返回 ConnectData，触发连线交互。
 * 通常作为 NodeView 的 child，由 NodeView 构造时自动布局。
 */
export default class PortView extends View implements IPortView {
    public readonly type = ViewType.PORTVIEW
    public portDirection: PortDirection
    /** 该端口允许的最大连线数 */
    public maxConnections: number
    /** 端口在节点上的索引 */
    public readonly portIndex?: number

    constructor(options: PortViewOptions) {
        const size = PORT_RADIUS * 2
        super({
            ...options,
            style: {
                width: size,
                height: size,
                overflow: 'visible',
                ...(options.style ?? {}),
            },
            content: new Circle(new Point3(PORT_RADIUS, PORT_RADIUS, 0), PORT_RADIUS),
        })
        this.portDirection = options.portDirection
        this.maxConnections = options.maxConnections ?? 1
        this.portIndex = options.portIndex
        // 端口不挂 BoundingBox（由 NodeView 统一管理选中态）
        this.boundingBox = null
    }

    /**
     * 获取端口中心的世界坐标
     */
    public getWorldCenter(): Point3 {
        const vp = this.viewport
        const localCenter = new Point3(
            vp.x + vp.width / 2,
            vp.y + vp.height / 2,
            0
        )
        return this.getWorldMatrix().multiply(localCenter)
    }

    /**
     * 命中端口时返回 ConnectData，触发连线交互
     */
    protected interactContent(point: Point3, bufferCtx?: IDrawingContext): IInteractResult {
        if (!this.content) return { view: null, content: null, extraData: null }
        const hit =
            this.content.isPointInPath(point, bufferCtx) ||
            this.content.isPointOnCurve(point, 4)
        if (hit) {
            return {
                view: this,
                content: this.content,
                extraData: {
                    cursorStyle: Cursor.Crosshair,
                    action: Action.CONNECT,
                    portViewId: this.id,
                },
            }
        }
        return { view: null, content: null, extraData: null }
    }

    /**
     * 渲染：根据状态切换填充色
     * - 默认：白底灰边
     * - actived（连线中）：橙色高亮
     */
    public renderContent(ctx: IDrawingContext): void {
        if (!this.content) return
        const circle = this.content as Circle
        ctx.save()

        ctx.fillStyle = this.actived ? '#f97316' : '#ffffff'
        ctx.beginPath()
        ctx.arc(circle.center.x, circle.center.y, circle.xRadius, 0, Math.PI * 2)
        ctx.fill()

        ctx.strokeStyle = this.actived ? '#ea580c' : '#6b7280'
        ctx.lineWidth = 2
        ctx.stroke()

        ctx.restore()
    }

    // ── 序列化 ──

    public override toJSON(): any {
        const base = super.toJSON()
        return {
            ...base,
            portDirection: this.portDirection,
            maxConnections: this.maxConnections,
            portIndex: this.portIndex,
        }
    }

    public static fromJSON(data: any): PortView {
        const port = new PortView({
            id: data.id,
            portDirection: data.portDirection,
            maxConnections: data.maxConnections ?? 1,
            portIndex: data.portIndex,
        })
        port.restoreCommonFields(data)
        return port
    }

    // ── 其他 ──

    public copy(): PortView {
        return new PortView({
            id: this.id,
            portDirection: this.portDirection,
            maxConnections: this.maxConnections,
            portIndex: this.portIndex,
            style: { ...this.style },
            matrix: this.matrix.copy(),
        })
    }

    public layoutContent(): Bounds {
        return this.content?.bounds ?? Bounds.empty()
    }
}
