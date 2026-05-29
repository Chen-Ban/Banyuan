import {
    Action,
    Cursor,
} from '@/types/index.js'
import { ViewType } from '@/foundation/constants.js'
import View from '@/view/View/View.js'
import Point3 from '@/foundation/math/Point3.js'
import Bounds from '@/graph/base/Bounds.js'
import { isPortView } from '@/types/index.js'
import type {
    IEdgeView,
    IInteractResult,
    IViewOptions,
} from '@/types/index.js'
import type PortView from './PortView.js'

export interface EdgeViewOptions extends IViewOptions {
    fromPortId?: string | null
    toPortId?: string | null
}

/**
 * EdgeView —— 流程图连线
 *
 * 不挂 BoundingBox 插件，viewport 每帧根据两端端口坐标动态更新。
 * 渲染为三次贝塞尔曲线，命中曲线路径时返回 MoveData（支持选中/删除）。
 */
export default class EdgeView extends View implements IEdgeView {
    public readonly type = ViewType.EDGEVIEW

    public fromPortId: string | null
    public toPortId: string | null

    /** 连线拖拽中的临时终点（世界坐标） */
    private _tempTarget: Point3 | null = null

    constructor(options: EdgeViewOptions = {}) {
        super({
            ...options,
            style: {
                width: 0,
                height: 0,
                overflow: 'visible',
                ...(options.style ?? {}),
            },
        })
        this.fromPortId = options.fromPortId ?? null
        this.toPortId   = options.toPortId   ?? null
        // 不挂 BoundingBox
        this.boundingBox = null
    }

    // ── IEdgeView 接口 ──

    public setTempTarget(point: Point3): void {
        this._tempTarget = point
    }

    public connect(fromPortId: string, toPortId: string): void {
        this.fromPortId = fromPortId
        this.toPortId   = toPortId
        this._tempTarget = null
    }

    // ── 端口查找 ──

    private _findPort(portId: string): PortView | null {
        const scene = this.getScene()
        if (!scene) return null
        // 通过 Scene.findViewById 深度查找
        const view = scene.findViewById(portId)
        return (view && isPortView(view)) ? (view as PortView) : null
    }

    /**
     * 计算起点和终点的世界坐标
     * 返回 null 表示端口尚未就绪（连线无效）
     */
    private _resolveEndpoints(): { from: Point3; to: Point3 } | null {
        if (!this.fromPortId) return null

        const fromPort = this._findPort(this.fromPortId)
        if (!fromPort) return null
        const from = fromPort.getWorldCenter()

        // 连线完成：从目标端口取终点
        if (this.toPortId) {
            const toPort = this._findPort(this.toPortId)
            if (!toPort) return null
            return { from, to: toPort.getWorldCenter() }
        }

        // 连线中：用临时终点
        if (this._tempTarget) {
            return { from, to: this._tempTarget }
        }

        return null
    }

    /**
     * 每帧渲染前更新 viewport（用于框选命中）
     */
    private _updateViewport(from: Point3, to: Point3): void {
        const minX = Math.min(from.x, to.x)
        const minY = Math.min(from.y, to.y)
        const maxX = Math.max(from.x, to.x)
        const maxY = Math.max(from.y, to.y)
        // 加一点 padding 保证贝塞尔控制点不超出包围盒
        const pad = 20
        this.viewport = new Bounds(minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2)
    }

    // ── 渲染 ──

    /**
     * 直接在世界坐标系下绘制贝塞尔曲线
     * EdgeView 的 matrix 保持 identity，不做额外变换
     */
    public renderContent(ctx: CanvasRenderingContext2D): void {
        const endpoints = this._resolveEndpoints()
        if (!endpoints) return

        const { from, to } = endpoints
        this._updateViewport(from, to)

        // 水平方向贝塞尔控制点：控制点 x 偏移为两端点水平距离的一半
        const dx = Math.abs(to.x - from.x) * 0.5
        const cp1 = new Point3(from.x + dx, from.y, 0)
        const cp2 = new Point3(to.x - dx,   to.y,   0)

        ctx.save()
        ctx.beginPath()
        ctx.moveTo(from.x, from.y)
        ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, to.x, to.y)

        ctx.strokeStyle = this.actived ? '#3b82f6' : '#6b7280'
        ctx.lineWidth   = this.actived ? 2.5 : 1.5
        ctx.setLineDash(this.toPortId ? [] : [6, 4])  // 连线中显示虚线
        ctx.stroke()
        ctx.setLineDash([])

        // 终点箭头
        this._drawArrow(ctx, cp2, to)

        ctx.restore()
    }

    /** 绘制终点箭头 */
    private _drawArrow(ctx: CanvasRenderingContext2D, cp: Point3, tip: Point3): void {
        const angle = Math.atan2(tip.y - cp.y, tip.x - cp.x)
        const size  = 8
        ctx.save()
        ctx.translate(tip.x, tip.y)
        ctx.rotate(angle)
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(-size, -size / 2)
        ctx.lineTo(-size,  size / 2)
        ctx.closePath()
        ctx.fillStyle = this.actived ? '#3b82f6' : '#6b7280'
        ctx.fill()
        ctx.restore()
    }

    // ── 交互 ──

    /**
     * EdgeView 在世界坐标系下绘制，interact 直接用世界坐标做命中检测
     */
    public interact(worldPoint: Point3): IInteractResult {
        const endpoints = this._resolveEndpoints()
        if (!endpoints) return { view: null, content: null, extraData: null }

        const { from, to } = endpoints
        const dx = Math.abs(to.x - from.x) * 0.5
        const cp1 = new Point3(from.x + dx, from.y, 0)
        const cp2 = new Point3(to.x - dx,   to.y,   0)

        // 用参数采样近似命中检测（贝塞尔曲线上每隔一段取一个点）
        const HIT_THRESHOLD = 8
        const SAMPLES = 50
        for (let i = 0; i <= SAMPLES; i++) {
            const t = i / SAMPLES
            const pt = this._cubicBezierPoint(from, cp1, cp2, to, t)
            const dist = Math.sqrt(
                (pt.x - worldPoint.x) ** 2 + (pt.y - worldPoint.y) ** 2
            )
            if (dist <= HIT_THRESHOLD) {
                return {
                    view: this,
                    content: null,
                    extraData: { cursorStyle: Cursor.Pointer, action: Action.MOVE },
                }
            }
        }
        return { view: null, content: null, extraData: null }
    }

    /** 三次贝塞尔曲线上 t 处的点 */
    private _cubicBezierPoint(p0: Point3, p1: Point3, p2: Point3, p3: Point3, t: number): Point3 {
        const mt = 1 - t
        const x = mt ** 3 * p0.x + 3 * mt ** 2 * t * p1.x + 3 * mt * t ** 2 * p2.x + t ** 3 * p3.x
        const y = mt ** 3 * p0.y + 3 * mt ** 2 * t * p1.y + 3 * mt * t ** 2 * p2.y + t ** 3 * p3.y
        return new Point3(x, y, 0)
    }

    // ── 序列化 ──

    public override toJSON(): any {
        const base = super.toJSON()
        return {
            ...base,
            fromPortId: this.fromPortId,
            toPortId: this.toPortId,
        }
    }

    public static fromJSON(data: any): EdgeView {
        const edge = new EdgeView({
            id: data.id,
            fromPortId: data.fromPortId ?? null,
            toPortId: data.toPortId ?? null,
        })
        edge.restoreCommonFields(data)
        return edge
    }

    // ── 其他 ──

    public copy(): EdgeView {
        return new EdgeView({
            id: this.id,
            fromPortId: this.fromPortId,
            toPortId:   this.toPortId,
            style: { ...this.style },
            matrix: this.matrix.copy(),
        })
    }

    public layoutContent(): Bounds {
        return Bounds.empty()
    }

    protected interactContent(_point: Point3, _bufferCtx?: CanvasRenderingContext2D): IInteractResult {
        return { view: null, content: null, extraData: null }
    }
}
