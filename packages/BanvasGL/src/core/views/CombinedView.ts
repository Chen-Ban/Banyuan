import View, { ViewOptions } from './View'

// 组合视图选项接口
export interface CombinedViewOptions extends Omit<ViewOptions, 'content'> {
    // 组合视图特有的选项可以在这里添加
}

/**
 * 组合视图 - 专门处理View[]类型内容，管理子View
 */
export default class CombinedView extends View {
    public content: View[] = []

    constructor(views: View[] = [], options: CombinedViewOptions = {}) {
        // 将views作为content传递给父类构造函数
        super({ ...options, content: views })
        this.content = [...views]
        // 设置子View的父引用
        this.content.forEach(view => {
            view.parent = this as any
        })
        
    }

    public renderContent(ctx: CanvasRenderingContext2D): void {
        // CombinedView不需要渲染子View，因为：
        // 1. Scene使用后序遍历，所有子View都会在CombinedView之前被渲染
        // 2. 子View已经通过Scene的渲染流程独立渲染了
        // 3. CombinedView本身只是一个容器，没有自己的视觉内容
        
        // 如果需要为CombinedView添加背景、边框等视觉元素，可以在这里实现
        // 例如：
        // if (this.style && this.style.fill) {
        //     ctx.fillStyle = this.style.fill.color
        //     const bounds = this.getContentBounds()
        //     if (bounds) {
        //         ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height)
        //     }
        // }
    }

    public getContentBounds(): { x: number, y: number, width: number, height: number }  {
        if (this.content.length === 0) {
            return { x: 0, y: 0, width: 0, height: 0 }
        }

        let minX = Infinity
        let minY = Infinity
        let maxX = -Infinity
        let maxY = -Infinity

        for (const child of this.content) {
            const childBounds = child.getContentBounds()
            if (childBounds) {
                minX = Math.min(minX, childBounds.x)
                minY = Math.min(minY, childBounds.y)
                maxX = Math.max(maxX, childBounds.x + childBounds.width)
                maxY = Math.max(maxY, childBounds.y + childBounds.height)
            }
        }

        if (minX === Infinity) {
            return { x: 0, y: 0, width: 0, height: 0 }
        }

        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        }
    }

    public copy(): CombinedView {
        const newView = new CombinedView(this.content.map(view => view.copy()))
        
        // 复制基本属性
        newView.layer = this.layer
        newView.id = this.id
        newView.properties = { ...this.properties }
        newView.data = { ...this.data }
        newView.style = this.style.copy()
        newView.selected = this.selected
        newView.actived = this.actived
        newView.freezed = this.freezed
        newView.visible = this.visible
        newView.matrix = this.matrix.copy()

        // 复制插件
        if (this.viewport) {
            newView.viewport = { ...this.viewport }
        }
        if (this.controlPoints) {
            newView.controlPoints = { ...this.controlPoints }
        }
        if (this.boundingBox) {
            newView.boundingBox = { ...this.boundingBox }
        }

        return newView
    }


    // 子View管理方法
    public addChild(child: View): void {
        if (!this.content.includes(child)) {
            this.content.push(child)
            child.parent = this as any
            child.onAttach()
            this.invalidateCache()
        }
    }

    public removeChild(child: View): void {
        const index = this.content.indexOf(child)
        if (index > -1) {
            this.content.splice(index, 1)
            child.parent = null
            this.invalidateCache()
        }
    }

    public getChildren(): View[] {
        return [...this.content]
    }

    public getChildCount(): number {
        return this.content.length
    }

    public insertAt(index: number, view: View): void {
        if (index >= 0 && index <= this.content.length) {
            this.content.splice(index, 0, view)
            view.parent = this as any
            view.onAttach()
            this.invalidateCache()
        }
    }

    public clear(): void {
        this.content.forEach(child => {
            child.parent = null
            child.onDestroy()
        })
        this.content = []
        this.invalidateCache()
    }

    public isCombinedView(){
        return true
    }

    // 重写contains方法以支持子View
    public contains(view: View): boolean {
        if (this === view) {
            return true
        }
        return this.content.some(child => child.contains(view))
    }

    // 重写invalidateCache方法以支持子View
    public invalidateCache(): void {
        super.invalidateCache()
        // 递归使子视图缓存失效
        this.content.forEach(child => child.invalidateCache())
    }


}
