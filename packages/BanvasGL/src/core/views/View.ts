import { VIEWTYPE } from '../../constants'
import Style from '../style/Style'
import Matrix4 from '../math/Matrix4'
import CanvasContext from '../renderer/CanvasContext'
import { v4 as uuidv4 } from 'uuid'
import Scene from '../scene/Scene'

// 导入图形相关类型
import { Graph } from '../graph'
import { ImageElement } from '../graph/image'
import { VideoElement } from '../graph/video'
import { Texts } from '../graph/text'

// 导入addon类型
import { ViewportAddon, BoundingBoxAddon, VertexAddon, BoundingBoxAddonImpl, ViewportAddonImpl } from './addon'

// 视图选项接口
export interface ViewOptions<T extends object = any> {
    id?: string
    content: ViewContent  // 必填字段：视图内容
    data?: T
    properties?: T
    style?: Style
    matrix?: Matrix4  // 变换矩阵
    viewport?: ViewportAddon
    controlPoints?: VertexAddon
    boundingBox?: BoundingBoxAddon
    onCreate?: () => void
    onAttach?: () => void
    onDestroy?: () => void
    [funcName: string]: any
}

// 内容类型联合
type ViewContent = Graph | ImageElement | VideoElement | Texts | View[] | null

export default abstract class View<T extends object = any> {
    // 基本属性
    public readonly type: VIEWTYPE.VIEW = VIEWTYPE.VIEW
    public layer: number = 0
    public id: string = ''
    public properties: T = {} as T
    public data: T = {} as T
    
    // 抽象内容属性 - 子类必须实现
    public abstract content: ViewContent
    
    // 层级关系
    public parent: Scene | View | null = null
    public sibling: View | null = null
    
    // 样式和状态
    public style: Style = new Style()
    public selected: boolean = false
    public actived: boolean = false
    public freezed: boolean = false
    public visible: boolean = true
    
    // 变换矩阵
    public matrix: Matrix4 = Matrix4.identity()
    
    // 插件
    public viewport: ViewportAddon | null = null
    public controlPoints: VertexAddon | null = null
    public boundingBox: BoundingBoxAddon | null = null

    // 私有属性
    private _isConstructed: boolean = false
    private _isDestroyed: boolean = false
    
    // 缓存相关属性
    private _cacheDirty: boolean = true
    private _lastRenderTime: number = 0
    private _cacheValid: boolean = false

    constructor(options: ViewOptions<T>) {
        this.construct(options)
    }

    // 构造方法
    public construct(vo: ViewOptions<T>): void {
        if (this._isConstructed) {
            console.warn('View is already constructed')
            return
        }

        // 生成或设置ID
        this.id = vo.id || this.generateId()

        // 设置基本属性
        if (vo.data !== undefined) {
            this.data = vo.data
        }
        if (vo.properties !== undefined) {
            this.properties = vo.properties
        }

        // 设置样式
        if (vo.style) {
            this.style = vo.style
        }

        // 设置变换矩阵
        if (vo.matrix) {
            this.matrix = vo.matrix
        }

        // 设置内容（必须在视口插件初始化之前）
        this.content = vo.content

        // 获取内容边界框
        const contentBounds = this.getContentBounds()
        if(!contentBounds)throw new Error('Content bounds is not set')

        const viewWidth = Math.max(0, contentBounds.x + contentBounds.width)
        const viewHeight = Math.max(0, contentBounds.y + contentBounds.height)

        // 先初始化包围盒插件，使用计算出的view尺寸
        this.boundingBox = vo.boundingBox || new BoundingBoxAddonImpl(
            viewWidth, 
            viewHeight,
            this.style.padding,
            this.style.margin
        )

        // 用包围盒信息初始化视口插件
        const boundingBoxBounds = this.boundingBox.getBounds()
        this.viewport = vo.viewport || new ViewportAddonImpl(
            boundingBoxBounds.x,
            boundingBoxBounds.y,
            boundingBoxBounds.width, 
            boundingBoxBounds.height
        )
        
        this.controlPoints = vo.controlPoints || null

        // 设置回调函数
        if (vo.onCreate) {
            this.onCreate = vo.onCreate
        }
        if (vo.onAttach) {
            this.onAttach = vo.onAttach
        }
        if (vo.onDestroy) {
            this.onDestroy = vo.onDestroy
        }

        // 设置其他自定义方法
        Object.keys(vo).forEach(key => {
            if (typeof vo[key] === 'function' && !['onCreate', 'onAttach', 'onDestroy'].includes(key)) {
                (this as any)[key] = vo[key]
            }
        })

        this._isConstructed = true
        this.onCreated()
    }

    // 设置数据
    public setData(data: Partial<T>): void {
        this.data = { ...this.data, ...data }
        if (!this._batchUpdating) {
            this.invalidateCache()
        }
    }



    // 生命周期回调
    public onCreated(): void {
        // 子类可以重写此方法
    }

    public onDestroy(): void {
        if (this._isDestroyed) {
            return
        }
        this._isDestroyed = true
        
        // 清理引用
        this.parent = null
        this.sibling = null
        this.content = null
    }

    public onAttach(): void {
        // 子类可以重写此方法
    }

    // 自定义方法（索引签名）
    [funcName: string]: any

    // 视图判断
    public isView(): boolean {
        return true
    }

    // 渲染方法
    public render(canvasContext: CanvasContext, mvpMatrix: Matrix4): void {
        if (!this.visible || this._isDestroyed) {
            return
        }

        // 检查是否需要视口裁剪
        const needsViewportCulling = this.needsViewportCulling()
        
        if (needsViewportCulling) {
            // 使用离屏画布渲染
            this.renderWithOffscreen(canvasContext, mvpMatrix)
        } else {
            // 直接在主画布渲染
            this.renderDirectly(canvasContext, mvpMatrix)
        }
    }

    // 直接渲染到主画布
    private renderDirectly(canvasContext: CanvasContext, mvpMatrix: Matrix4): void {
        // 保存主画布状态
        canvasContext.mainCtx.save()
        
        // 应用MVP矩阵变换
        const transform = mvpMatrix.transform
        
        canvasContext.mainCtx.setTransform(
            transform[0], transform[4], transform[1], transform[5],
            transform[3], transform[7]
        )
        
        // 应用样式
        if (this.style) {
            this.style.applyToContext(canvasContext.mainCtx)
        }

        // 渲染插件（如果是激活状态并且有对应插件）
        this.renderPlugins(canvasContext.mainCtx)
        // 渲染内容
        this.renderContent(canvasContext.mainCtx)

        // 恢复主画布状态
        canvasContext.mainCtx.restore()
    }

    // 使用离屏画布渲染
    private renderWithOffscreen(canvasContext: CanvasContext, mvpMatrix: Matrix4): void {
        const offscreenCtx = canvasContext.bufferCtx
        if (!offscreenCtx) {
            // 如果没有离屏画布，回退到直接渲染
            this.renderDirectly(canvasContext, mvpMatrix)
            return
        }   

        // 获取视口信息
        const viewport = this.getViewport()
        if (!viewport) {
            this.renderDirectly(canvasContext, mvpMatrix)
            return
        }

        // 检查缓存是否有效
        if (this._cacheValid && !this._cacheDirty) {
            // 使用缓存渲染
            this.renderFromCache(canvasContext, mvpMatrix)
            return
        }

        // 重新渲染到离屏画布
        this.renderToOffscreen(canvasContext, viewport, mvpMatrix)
        
        // 标记缓存为有效
        this._cacheValid = true
        this._cacheDirty = false
        this._lastRenderTime = Date.now()

        // 从离屏画布渲染到主画布
        this.renderFromCache(canvasContext, mvpMatrix)
    }

    // 渲染到离屏画布
    private renderToOffscreen(canvasContext: CanvasContext, viewport: ViewportAddon, mvpMatrix: Matrix4): void {
        const offscreenCtx = canvasContext.bufferCtx
        if (!offscreenCtx) return
        
        // 获取主画布尺寸，让缓冲区与主画布一样大
        const mainCanvas = canvasContext.mainCtx.canvas
        offscreenCtx.canvas.width = mainCanvas.width
        offscreenCtx.canvas.height = mainCanvas.height

        // 清空离屏画布
        offscreenCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height)

        // 保存离屏画布状态
        offscreenCtx.save()

        // 应用MVP矩阵变换
        const transform = mvpMatrix.transform
        offscreenCtx.setTransform(
            transform[0], transform[4], transform[1], transform[5],
            transform[3], transform[7]
        )

        // 应用样式到离屏画布
        if (this.style) {
            this.style.applyToContext(offscreenCtx)
        }

        // 先设置视口裁剪区域
        offscreenCtx.beginPath()
        offscreenCtx.rect(viewport.x, viewport.y, viewport.width, viewport.height)
        offscreenCtx.clip()

        // 渲染插件到离屏画布（如果是激活状态并且有对应插件）
        this.renderPlugins(offscreenCtx)

        // 渲染内容到离屏画布
        this.renderContent(offscreenCtx)



        // 恢复离屏画布状态
        offscreenCtx.restore()
    }

    // 从缓存渲染到主画布
    private renderFromCache(canvasContext: CanvasContext, mvpMatrix: Matrix4): void {
        const mainCtx = canvasContext.mainCtx
        const offscreenCtx = canvasContext.bufferCtx
        if (!offscreenCtx) return
        
        // 保存主画布状态
        mainCtx.save()
        
        // 应用MVP矩阵变换
        const transform = mvpMatrix.transform
        mainCtx.setTransform(
            transform[0], transform[4], transform[1], transform[5],
            transform[3], transform[7]
        )
        
        // 将离屏画布内容绘制到主画布（缓冲区与主画布一样大）
        mainCtx.drawImage(offscreenCtx.canvas, 0, 0)
        
        // 恢复主画布状态
        mainCtx.restore()
    }


    // 渲染插件
    private renderPlugins(ctx: CanvasRenderingContext2D): void {
        // 只有在激活状态时才渲染插件
        // if (!this.actived) {
        //     return
        // }

        // 保存画布状态
        ctx.save()

        try {
            // 渲染控制点插件
            if (this.controlPoints) {
                this.renderControlPoints(ctx)
            }

            // 渲染边界框插件
            if (this.boundingBox) {
                this.renderBoundingBox(ctx)
            }
        } finally {
            // 恢复画布状态
            ctx.restore()
        }
    }

    // 渲染控制点
    private renderControlPoints(ctx: CanvasRenderingContext2D): void {
        if (!this.controlPoints || this.controlPoints.vertices.length === 0) {
            return
        }

        // 设置控制点样式
        ctx.fillStyle = '#ff0000' // 红色填充
        ctx.strokeStyle = '#ffffff' // 白色描边
        ctx.lineWidth = 2

        // 渲染每个控制点
        this.controlPoints.vertices.forEach(vertex => {
            ctx.beginPath()
            ctx.arc(vertex.x, vertex.y, 4, 0, 2 * Math.PI) // 半径为4的圆
            ctx.fill()
            ctx.stroke()
        })
    }

    // 渲染边界框
    private renderBoundingBox(ctx: CanvasRenderingContext2D): void {
        if (!this.boundingBox) {
            return
        }

        // 获取边界框信息
        const bounds = this.boundingBox.getBounds()
        console.log(bounds);
        
        
        if (!bounds) {
            return
        }

        // 设置边界框样式
        ctx.strokeStyle = '#00ff00' // 绿色描边
        ctx.lineWidth = 1
        ctx.setLineDash([5, 5]) // 虚线

        // 绘制边界框
        ctx.beginPath()
        ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height)
        ctx.stroke()

        // 重置虚线
        ctx.setLineDash([])
    }

    // 检查是否需要视口裁剪
    private needsViewportCulling(): boolean {
        const viewport = this.getViewport()
        
        if (!viewport) {
            return false
        }

        // 检查内容是否超出视口边界
        return this.hasContentOutsideViewport(viewport)
    }


    // 检查内容是否在视口外
    private hasContentOutsideViewport(viewport: ViewportAddon): boolean {
        // 获取内容的边界框
        const contentBounds = this.getContentBounds()
        const bounds = this.boundingBox?.getBounds()
        if (!contentBounds || !bounds) {
            return false
        }

        // 检查边界框是否与视口相交
        // 视口始终基于(0,0)，所以直接比较尺寸
        return contentBounds.x < bounds.x || 
               contentBounds.y < bounds.y || 
               contentBounds.x + contentBounds.width > viewport.width || 
               contentBounds.y + contentBounds.height > viewport.height
    }

    // 获取内容边界框
    // 抽象方法 - 子类必须实现
    public abstract getContentBounds(): { x: number, y: number, width: number, height: number } 




    // 缓存管理方法
    public invalidateCache(): void {
        this._cacheDirty = true
        this._cacheValid = false
    }

    public isCacheValid(): boolean {
        return this._cacheValid && !this._cacheDirty
    }

    public getLastRenderTime(): number {
        return this._lastRenderTime
    }

    // 设置合成模式
    public setCompositeMode(mode: GlobalCompositeOperation): View {
        if (!this.style) {
            this.style = new Style()
        }
        
        // 扩展Style类以支持合成模式
        ;(this.style as any).compositeMode = mode
        this.invalidateCache()
        return this
    }

    public getCompositeMode(): GlobalCompositeOperation | null {
        return (this.style as any)?.compositeMode || null
    }

    // 视口裁剪优化
    public setViewportClipping(enabled: boolean): View {
        if (!this.viewport) {
            this.viewport = { x: 0, y: 0, width: 0, height: 0 }
        }
        ;(this.viewport as any).clippingEnabled = enabled
        this.invalidateCache()
        return this
    }

    public isViewportClippingEnabled(): boolean {
        return (this.viewport as any)?.clippingEnabled || false
    }

    // 性能优化：批量更新
    public beginBatchUpdate(): void {
        // 暂停缓存失效
        this._batchUpdating = true
    }

    public endBatchUpdate(): void {
        this._batchUpdating = false
        // 批量更新结束后统一失效缓存
        this.invalidateCache()
    }

    // 私有属性：批量更新状态
    private _batchUpdating: boolean = false



    // 获取世界矩阵（考虑父view的matrix）
    public getWorldMatrix(): Matrix4 {
        if (this.parent && this.parent instanceof View) {
            // 如果有父view，则世界矩阵 = 父view的世界矩阵 * 当前view的matrix
            return this.parent.getWorldMatrix().copy().multiply(this.matrix)
        } else {
            // 如果没有父view，则世界矩阵就是当前view的matrix
            return this.matrix.copy()
        }
    }

    // 变换方法
    public translate(x: number, y: number, z: number = 0): View {
        this.matrix.translate(x, y, z)
        if (!this._batchUpdating) {
            this.invalidateCache()
        }
        return this
    }

    public scale(x: number, y: number, z: number = 1): View {
        this.matrix.scale(x, y, z)
        if (!this._batchUpdating) {
            this.invalidateCache()
        }
        return this
    }

    public rotate(x: number, y: number, z: number): View {
        this.matrix.rotate(x, y, z)
        if (!this._batchUpdating) {
            this.invalidateCache()
        }
        return this
    }

    public setTransform(matrix: Matrix4): View {
        this.matrix = matrix.copy()
        if (!this._batchUpdating) {
            this.invalidateCache()
        }
        return this
    }

    // 状态管理
    public setVisible(visible: boolean): View {
        this.visible = visible
        return this
    }

    public setSelected(selected: boolean): View {
        this.selected = selected
        return this
    }

    public setActived(actived: boolean): View {
        this.actived = actived
        return this
    }

    public setFreezed(freezed: boolean): View {
        this.freezed = freezed
        return this
    }

    public setLayer(layer: number): View {
        this.layer = layer
        return this
    }

    // 样式管理
    public setStyle(style: Style): View {
        this.style = style.copy()
        if (!this._batchUpdating) {
            this.invalidateCache()
        }
        return this
    }

    // 视口管理
    public setViewport(viewport: ViewportAddon): View {
        this.viewport = { ...viewport }
        return this
    }

    public getViewport(): ViewportAddon | null {
        return this.viewport ? { ...this.viewport } : null
    }

    // 控制点管理
    public setControlPoints(controlPoints: VertexAddon): View {
        this.controlPoints = { ...controlPoints }
        return this
    }

    public getControlPoints(): VertexAddon | null {
        return this.controlPoints ? { ...this.controlPoints } : null
    }

    // 边界框管理
    public setBoundingBox(boundingBox: BoundingBoxAddon): View {
        this.boundingBox = { ...boundingBox }
        return this
    }

    public getBoundingBox(): BoundingBoxAddon | null {
        return this.boundingBox ? { ...this.boundingBox } : null
    }

    /**
     * 获取View的边界框（使用BoundingBoxAddon计算）
     * 返回包含内容大小和内边距的边界框
     */
    public getBounds(): { x: number, y: number, width: number, height: number } | null {
        if (!this.boundingBox) {
            return null
        }

        // 使用BoundingBoxAddon计算边界框（内容大小 + 内边距）
        return this.boundingBox.getBounds()
    }

    // 内容管理
    public setContent(content: ViewContent): View {
        this.content = content
        if (!this._batchUpdating) {
            this.invalidateCache()
        }
        return this
    }

    public getContent(): ViewContent {
        return this.content
    }

    // 查找方法
    public findById(id: string): View | null {
        if (this.id === id) {
            return this
        }
        return null
    }

    public findByType(type: VIEWTYPE): View[] {
        if (this.type === type) {
            return [this]
        }
        return []
    }

    // 遍历方法
    public traverse(callback: (view: View) => void): void {
        callback(this)
    }

    public traverseReverse(callback: (view: View) => void): void {
        callback(this)
    }

    // 获取根视图
    public getRoot(): View {
        let current: View = this
        while (current.parent && current.parent instanceof View) {
            current = current.parent
        }
        return current
    }

    // 获取深度
    public getDepth(): number {
        let depth = 0
        let current: View | null = this.parent as View
        while (current) {
            depth++
            current = current.parent as View
        }
        return depth
    }

    // 检查是否包含指定视图
    public contains(view: View): boolean {
        return this === view
    }

    // 获取所有后代视图
    public getDescendants(): View[] {
        const descendants: View[] = []
        this.traverse(view => {
            if (view !== this) {
                descendants.push(view)
            }
        })
        return descendants
    }

    // 获取兄弟视图
    public getSiblings(): View[] {
        return []
    }

    // 获取下一个兄弟视图
    public getNextSibling(): View | null {
        const siblings = this.getSiblings()
        const currentIndex = siblings.findIndex(sibling => sibling === this)
        return currentIndex < siblings.length - 1 ? siblings[currentIndex + 1] : null
    }

    // 获取上一个兄弟视图
    public getPreviousSibling(): View | null {
        const siblings = this.getSiblings()
        const currentIndex = siblings.findIndex(sibling => sibling === this)
        return currentIndex > 0 ? siblings[currentIndex - 1] : null
    }


    // 销毁视图
    public destroy(): void {
        this.onDestroy()
    }

    // 检查是否已销毁
    public isDestroyed(): boolean {
        return this._isDestroyed
    }

    // 检查是否已构造
    public isConstructed(): boolean {
        return this._isConstructed
    }

    // 生成唯一ID
    private generateId(): string {
        return uuidv4()
    }

    // 抽象方法 - 子类必须实现
    public abstract renderContent(ctx: CanvasRenderingContext2D): void
    public abstract copy(): View
}
