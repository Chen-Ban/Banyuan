import Bounds from '@/core/graph/base/Bounds'
import Rectangle from '@/core/graph/combined/Polygon/Rectangle'
import Style from '@/core/style/Style'
import { Point3, Vector3 } from '@/core/math'
import type { ExtraData } from '@/core/interfaces'
import { Action, Cursor, cursorMap } from '@/core/interfaces'
import { ADDONTYPE } from '@/core/constants'
import { Circle, Line } from '@/core/graph'
import { Color, StrokeStyle } from '@/core/style'
import type { IBoundingBoxAddon } from '@/core/interfaces'

export default class BoundingBoxAddon implements IBoundingBoxAddon {
    public readonly type = ADDONTYPE.BOUNDING_BOX
    public region: Rectangle
    public handles: Rectangle[]
    public rotate: [Line, Circle]

    // 基础参数（用于推导 region）
    private viewport: Bounds
    private handleSize: number = 8

    constructor(viewport: Bounds) {
        this.viewport = viewport
        this.region = this.computeRegion()
        this.handles = this.createHandles(this.region)
        this.rotate = this.createRotate()
    }

    private createHandles(region: Rectangle): Rectangle[] {
        const size = this.handleSize
        const half = size / 2
        const topLeft = region.getTopLeft()
        const width = region.width
        const height = region.height

        const points: Point3[] = [
            new Point3(topLeft.x, topLeft.y, 0),
            new Point3(topLeft.x + width / 2, topLeft.y, 0),
            new Point3(topLeft.x + width, topLeft.y, 0),
            new Point3(topLeft.x + width, topLeft.y + height / 2, 0),
            new Point3(topLeft.x + width, topLeft.y + height, 0),
            new Point3(topLeft.x + width / 2, topLeft.y + height, 0),
            new Point3(topLeft.x, topLeft.y + height, 0),
            new Point3(topLeft.x, topLeft.y + height / 2, 0),
        ]

        const handleStyle = new Style()
            .setStrokeWidth(1)
            .setFillColor(new Color(0, 255, 0, 1))
            .setStrokeColor(new Color(0, 255, 0, 0.2))
        return points.map(
            (p) =>
                new Rectangle(p.x - half, p.y - half, size, size, handleStyle)
        )
    }

    private createRotate(): [Line, Circle] {
        const center = this.region.getCenter()
        const up = new Point3(0, 0, 0).subtract(
            new Point3(0, center.y, 0)
        ).normalized
        const startPoint = new Point3(center.x, 0, 0)
        const endPoint = startPoint.copy().add(up.copy().scale(15))
        const circleCenter = startPoint.copy().add(up.copy().scale(20))
        const line = new Line(
            startPoint,
            endPoint,
            new Style().setStrokeWidth(1)
        )
        const circle = new Circle(
            circleCenter,
            5,
            new Style().setStrokeWidth(1)
        )
        return [line, circle]
    }

    // 扩展包围框使之包含原点
    private computeRegion(): Rectangle {
        return Rectangle.fromBounds(
            this.viewport.copy().expandToInclude(0, 0),
            new Style({
                strokeStyle: new StrokeStyle({
                    type: 'color',
                    color: new Color(0, 1, 0, 1),
                    dashArray: [5, 5],
                }),
            })
        )
    }

    public updateSize(): BoundingBoxAddon {
        this.region = this.computeRegion()
        this.handles = this.createHandles(this.region)
        this.rotate = this.createRotate()
        return this
    }

    /**
     * 获取边界框
     */
    getBounds(): Bounds {
        return this.region?.bounds ?? Bounds.empty()
    }

    /**
     * 在给定的上下文中渲染边界框
     */
    render(ctx: CanvasRenderingContext2D): void {
        const bounds = this.getBounds()
        if (!bounds) return
        ctx.save()
        try {
            this.region.render(ctx)
            this.handles.forEach((h) => h.render(ctx))
            this.rotate.forEach((r) => r.render(ctx))
        } finally {
            ctx.restore()
        }
    }

    /**
     * 复制边界框插件
     */
    copy(): BoundingBoxAddon {
        const boudingBox = new BoundingBoxAddon(this.viewport)
        boudingBox.region = this.region.copy()
        boudingBox.rotate = this.rotate.map((grph) => grph.copy()) as [
            Line,
            Circle,
        ]
        boudingBox.handles = this.handles.map((graph) => graph.copy())
        return boudingBox
    }
    /**
     * 交互接口
     */
    interact(p: Point3): ExtraData | null {
        const isMoving =
            this.region.isPointOnCurve(p, 5) ||
            this.rotate[0].isPointOnCurve(p, 5)
        const isRotate =
            this.rotate[1].isPointOnCurve(p, 2) ||
            this.rotate[1].isPointInPath(p)
        const handler = this.handles.find(
            (rec) => rec.isPointInPath(p) || rec.isPointOnCurve(p, 5)
        )

        if (isRotate) {
            return {
                cursorStyle: Cursor.Grab,
                action: Action.ROTATE,
            }
        } else if (handler) {
            const dynamicIndex = this.handles.findIndex((h) => h === handler)
            const fixedIndex = (dynamicIndex + 4) % 8
            return {
                cursorStyle: cursorMap[dynamicIndex] || Cursor.Default,
                action: Action.RESIZE,
                resizeFixedIndex: fixedIndex,
                resizeDynamicIndex: dynamicIndex,
            }
        }
        if (isMoving) {
            return {
                cursorStyle: Cursor.Move,
                action: Action.MOVE,
            }
        }
        return null
    }
}
