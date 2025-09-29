import { Point3, Matrix4 } from '../../math'

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
     * 获取内容区域尺寸（减去padding）
     */
    getContentSize(): { width: number, height: number } {
        return {
            width: this.width - this.padding.left - this.padding.right,
            height: this.height - this.padding.top - this.padding.bottom
        }
    }

    /**
     * 获取总尺寸（包含margin）
     */
    getTotalSize(): { width: number, height: number } {
        return {
            width: this.width + this.margin.left + this.margin.right,
            height: this.height + this.margin.top + this.margin.bottom
        }
    }

    /**
     * 获取边界框（内容大小 + 内边距）
     * 相对定位：左上角 = -paddingLeft, -paddingTop
     */
    getBounds(): { x: number, y: number, width: number, height: number } {
        return {
            x: -this.padding.left,
            y: -this.padding.top,
            width: this.width + this.padding.left + this.padding.right,
            height: this.height + this.padding.top + this.padding.bottom
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
