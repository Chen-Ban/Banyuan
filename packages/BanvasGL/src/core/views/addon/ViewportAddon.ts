import Bounds from "@/core/graph/base/Bounds"

/**
 * 视口插件
 * 定义视图的视口区域，支持独立的位置和尺寸设置
 * 初始时与view包围盒一致，后续可调整用于裁剪
 */
export interface ViewportAddon {
    x: number
    y: number
    width: number
    height: number
    [key: string]: any
}

export default class ViewportAddonImpl implements ViewportAddon {
    public x: number
    public y: number
    public width: number
    public height: number

    constructor(x: number = 0, y: number = 0, width: number = 0, height: number = 0) {
        this.x = x
        this.y = y
        this.width = width
        this.height = height
        
    }

    /**
     * 设置视口位置
     */
    setPosition(x: number, y: number): ViewportAddonImpl {
        this.x = x
        this.y = y
        return this
    }

    /**
     * 设置视口尺寸
     */
    setSize(width: number, height: number): ViewportAddonImpl {
        this.width = width
        this.height = height
        return this
    }

    /**
     * 设置视口位置和尺寸
     */
    setBounds(x: number, y: number, width: number, height: number): ViewportAddonImpl {
        this.x = x
        this.y = y
        this.width = width
        this.height = height
        return this
    }

    /**
     * 获取视口尺寸
     */
    getSize(): { width: number, height: number } {
        return {
            width: this.width,
            height: this.height
        }
    }

    /**
     * 获取视口位置
     */
    getPosition(): { x: number, y: number } {
        return {
            x: this.x,
            y: this.y
        }
    }

    /**
     * 获取视口边界
     */
    getBounds(): Bounds {
        return new Bounds(this.x,this.y,this.width,this.height)
    }

    /**
     * 检查点是否在视口内
     */
    containsPoint(x: number, y: number): boolean {
        return x >= this.x && x <= this.x + this.width && 
               y >= this.y && y <= this.y + this.height
    }

    /**
     * 复制视口插件
     */
    copy(): ViewportAddonImpl {
        const additionalProps: Record<string, any> = {}
        for (const key in this) {
            if (key !== 'x' && key !== 'y' && key !== 'width' && key !== 'height') {
                additionalProps[key] = this[key]
            }
        }
        return new ViewportAddonImpl(this.x, this.y, this.width, this.height)
    }
}
