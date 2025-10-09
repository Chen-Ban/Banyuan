import Bounds from "@/core/graph/base/Bounds"

/**
 * 边界框插件
 * 定义视图的边界框，包含padding和margin属性
 * 位置由view的matrix决定，不包含独立的x,y属性
 */
export interface BoundingBoxAddon {
    width: number
    height: number
    padding: {
        top: number
        right: number
        bottom: number
        left: number
    }
    margin: {
        top: number
        right: number
        bottom: number
        left: number
    }
    getBounds(): { x: number, y: number, width: number, height: number }
    render(ctx: CanvasRenderingContext2D): void
}

export default class BoundingBoxAddonImpl implements BoundingBoxAddon {
    public width: number
    public height: number
    public padding: {
        top: number
        right: number
        bottom: number
        left: number
    }
    public margin: {
        top: number
        right: number
        bottom: number
        left: number
    }

    constructor(
        width: number = 0,
        height: number = 0,
        padding: { top: number, right: number, bottom: number, left: number } = { top: 0, right: 0, bottom: 0, left: 0 },
        margin: { top: number, right: number, bottom: number, left: number } = { top: 0, right: 0, bottom: 0, left: 0 },
    ) {
        this.width = width
        this.height = height
        this.padding = { ...padding }
        this.margin = { ...margin }
        
    }

    /**
     * 设置边界框尺寸
     */
    setSize(width: number, height: number): BoundingBoxAddonImpl {
        this.width = width
        this.height = height
        return this
    }

    /**
     * 设置padding
     */
    setPadding(top: number, right: number, bottom: number, left: number): BoundingBoxAddonImpl {
        this.padding = { top, right, bottom, left }
        return this
    }

    /**
     * 设置margin
     */
    setMargin(top: number, right: number, bottom: number, left: number): BoundingBoxAddonImpl {
        this.margin = { top, right, bottom, left }
        return this
    }

    /**
     * 获取边界框（内容大小 + 内边距）
     * 相对定位：左上角 = -paddingLeft, -paddingTop
     */
    getBounds(): Bounds {
        return new Bounds(-this.padding.left,-this.padding.top,this.width + this.padding.left + this.padding.right,this.height + this.padding.top + this.padding.bottom)
    }

    /**
     * 在给定的上下文中渲染边界框
     */
    render(ctx: CanvasRenderingContext2D): void {
        const bounds = this.getBounds()
        if (!bounds) {
            return
        }
        ctx.save()
        try {
            ctx.strokeStyle = '#00ff00'
            ctx.lineWidth = 1
            ctx.setLineDash([5, 5])
            ctx.beginPath()
            ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height)
            ctx.stroke()
            ctx.setLineDash([])
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
        return x >= -this.padding.left && 
               x <= this.width + this.padding.right && 
               y >= -this.padding.top && 
               y <= this.height + this.padding.bottom
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
}
