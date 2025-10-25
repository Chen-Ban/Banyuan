import Bounds from "@/core/graph/base/Bounds"
import Rectangle from "@/core/graph/combined/Polygon/Rectangle"
import Style from "@/core/style/Style"
import { Point3 } from "@/core/math"

/**
 * 边界框插件
 * 定义视图的边界框，包含padding和margin属性
 * 位置由view的matrix决定，不包含独立的x,y属性
 */
export interface BoundingBoxAddon {
    region: Rectangle
    handles: Rectangle[]
    getBounds(): { x: number, y: number, width: number, height: number }
    render(ctx: CanvasRenderingContext2D): void
    hitTestHandle(x: number, y: number): number // -1 表示未命中
    resizeByHandle(handleIndex: number, dx: number, dy: number): void
}

export default class BoundingBoxAddonImpl implements BoundingBoxAddon {
    public region: Rectangle
    public handles: Rectangle[]

    // 基础参数（用于推导 region）
    private width: number
    private height: number
    private padding: { top: number; right: number; bottom: number; left: number }
    private margin: { top: number; right: number; bottom: number; left: number }
    private handleSize: number = 8

    constructor(
        width: number = 0,
        height: number = 0,
        padding: { top: number; right: number; bottom: number; left: number } = { top: 0, right: 0, bottom: 0, left: 0 },
        margin: { top: number; right: number; bottom: number; left: number } = { top: 0, right: 0, bottom: 0, left: 0 },
    ) {
        this.width = width
        this.height = height
        this.padding = { ...padding }
        this.margin = { ...margin }
        this.region = this.computeRegion()
        this.handles = this.createHandles(this.region)
    }

    private createHandles(region: Rectangle): Rectangle[] {
        const size = this.handleSize
        const half = size / 2
        const topLeft = region.getTopLeft()
        const width = region.width
        const height = region.height

        const points: Point3[] = [
            // corners
            new Point3(topLeft.x, topLeft.y, 0),
            new Point3(topLeft.x + width, topLeft.y, 0),
            new Point3(topLeft.x + width, topLeft.y + height, 0),
            new Point3(topLeft.x, topLeft.y + height, 0),
            // edges midpoints
            new Point3(topLeft.x + width / 2, topLeft.y, 0),
            new Point3(topLeft.x + width, topLeft.y + height / 2, 0),
            new Point3(topLeft.x + width / 2, topLeft.y + height, 0),
            new Point3(topLeft.x, topLeft.y + height / 2, 0),
        ]

        const handleStyle = new Style().setStrokeWidth(1)
        return points.map(p => new Rectangle(p.x - half, p.y - half, size, size, handleStyle))
    }

    private computeRegion(): Rectangle {
        // region 仅包含内容与 padding，不包含 margin
        const x = -this.padding.left
        const y = -this.padding.top
        const w = this.width + this.padding.left + this.padding.right
        const h = this.height + this.padding.top + this.padding.bottom
        return new Rectangle(x, y, w, h)
    }

    public setSize(width: number, height: number): BoundingBoxAddonImpl {
        this.width = width
        this.height = height
        this.region = this.computeRegion()
        this.handles = this.createHandles(this.region)
        return this
    }

    public setPadding(top: number, right: number, bottom: number, left: number): BoundingBoxAddonImpl {
        this.padding = { top, right, bottom, left }
        this.region = this.computeRegion()
        this.handles = this.createHandles(this.region)
        return this
    }

    public setMargin(top: number, right: number, bottom: number, left: number): BoundingBoxAddonImpl {
        this.margin = { top, right, bottom, left }
        this.region = this.computeRegion()
        this.handles = this.createHandles(this.region)
        return this
    }

    /**
     * 获取边界框（内容大小 + 内边距）
     * 相对定位：左上角 = -paddingLeft, -paddingTop
     */
    getBounds(): Bounds {
        const tl = this.region.getTopLeft()
        return new Bounds(tl.x, tl.y, this.region.width, this.region.height)
    }

    /**
     * 在给定的上下文中渲染边界框
     */
    render(ctx: CanvasRenderingContext2D): void {
        const bounds = this.getBounds()
        if (!bounds) return
        ctx.save()
        try {
            ctx.strokeStyle = '#00ff00'
            ctx.lineWidth = 1
            ctx.setLineDash([5, 5])
            ctx.beginPath()
            ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height)
            ctx.stroke()
            ctx.setLineDash([])

            // draw handles
            ctx.fillStyle = '#00ff00'
            this.handles.forEach(h => {
                const tl = h.getTopLeft()
                ctx.fillRect(tl.x, tl.y, h.width, h.height)
            })
        } finally {
            ctx.restore()
        }
    }

    /**
     * 检查点是否在边界框内（包含padding）
     */
    containsPoint(x: number, y: number): boolean {
        const bounds = this.getBounds()
        return x >= bounds.x && x <= bounds.x + bounds.width && 
               y >= bounds.y && y <= bounds.y + bounds.height
    }

    containsPointInContent(x: number, y: number): boolean {
        const tl = this.region.getTopLeft()
        return x >= tl.x && x <= tl.x + this.region.width && y >= tl.y && y <= tl.y + this.region.height
    }

    /**
     * 复制边界框插件
     */
    copy(): BoundingBoxAddonImpl {
        return new BoundingBoxAddonImpl(
            this.width,
            this.height,
            { ...this.padding },
            { ...this.margin },
        )
    }

    // ========== 交互相关 ==========
    /**
     * 命中测试手柄
     * 返回 0..7 的手柄索引，-1 表示未命中
     * 顺序：0 TL, 1 TR, 2 BR, 3 BL, 4 Top, 5 Right, 6 Bottom, 7 Left
     */
    public hitTestHandle(x: number, y: number): number {
        for (let i = 0; i < this.handles.length; i++) {
            const h = this.handles[i]
            const tl = h.getTopLeft()
            if (x >= tl.x && x <= tl.x + h.width && y >= tl.y && y <= tl.y + h.height) {
                return i
            }
        }
        return -1
    }

    /**
     * 通过拖拽指定手柄进行缩放
     * dx, dy 为世界（或当前坐标系）中的增量
     */
    public resizeByHandle(handleIndex: number, dx: number, dy: number): void {
        // 当前 region 的实际边界
        const tl = this.region.getTopLeft()
        const tr = new Point3(tl.x + this.region.width, tl.y, 0)
        const br = new Point3(tl.x + this.region.width, tl.y + this.region.height, 0)
        const bl = new Point3(tl.x, tl.y + this.region.height, 0)

        // 计算四边的改变量
        let dLeft = 0, dTop = 0, dRight = 0, dBottom = 0
        switch (handleIndex) {
            case 0: // TL
                dLeft = dx; dTop = dy; break
            case 1: // TR
                dRight = dx; dTop = dy; break
            case 2: // BR
                dRight = dx; dBottom = dy; break
            case 3: // BL
                dLeft = dx; dBottom = dy; break
            case 4: // Top
                dTop = dy; break
            case 5: // Right
                dRight = dx; break
            case 6: // Bottom
                dBottom = dy; break
            case 7: // Left
                dLeft = dx; break
            default:
                return
        }

        // 仅调整内容与 padding，使 region 改变（region 不包含 margin）
        if (dLeft !== 0) {
            this.padding.left = Math.max(0, this.padding.left - dLeft)
            this.width = Math.max(0, this.width - dLeft)
        }
        if (dTop !== 0) {
            this.padding.top = Math.max(0, this.padding.top - dTop)
            this.height = Math.max(0, this.height - dTop)
        }
        if (dRight !== 0) {
            this.width = Math.max(0, this.width + dRight)
        }
        if (dBottom !== 0) {
            this.height = Math.max(0, this.height + dBottom)
        }

        // 重新计算 region 与手柄
        this.region = this.computeRegion()
        this.handles = this.createHandles(this.region)
    }

    public setHandleSize(size: number): BoundingBoxAddonImpl {
        this.handleSize = Math.max(2, size)
        this.handles = this.createHandles(this.region)
        return this
    }
}
