import View from '../views/View'
import { BaseCamera } from '../camera'
import { OperationStack, Operation, SnapshotApplier, SceneSnapshot } from './operationStack'
import CanvasContext from '../renderer/CanvasContext'
import Matrix4 from '../math/Matrix4'
import Style from '../style/Style'
import { v4 as uuidv4 } from 'uuid'
import { GraphView, ImageView, VideoView, TextView, CombinedView, GraphViewOptions, ImageViewOptions, VideoViewOptions, TextViewOptions, CombinedViewOptions } from '../views'

export interface SceneOptions {
    camera?: BaseCamera
    style?: Style
    data?: any
    onLoad?: (params: any) => void
    onUnload?: () => void
    onShow?: () => void
    onHide?: () => void
}

export default class Scene {
    // 基本属性
    public id: string = ''
    public children: View[] = []
    public camera: BaseCamera
    public style: Style
    public data: any = {}
    public operationStack: OperationStack

    // 私有属性
    private _isLoaded: boolean = false
    private _isVisible: boolean = false
    private _loadParams: any = null
    
    // 生命周期回调函数
    private _onLoad?: (params: any) => void
    private _onUnload?: () => void
    private _onShow?: () => void
    private _onHide?: () => void

    constructor(camera: BaseCamera, options: SceneOptions = {}) {
        this.camera = camera
        this.style = options.style || new Style()
        this.operationStack = new OperationStack()
        
        // 设置快照应用器
        this.operationStack.setSnapshotApplier(this.applySnapshot.bind(this))
        
        // 设置选项
        if (options.data) {
            this.data = options.data
        }
        
        // 保存生命周期回调函数
        this._onLoad = options.onLoad
        this._onUnload = options.onUnload
        this._onShow = options.onShow
        this._onHide = options.onHide

        // 生成唯一ID
        this.id = this.generateId()
    }

    // 生命周期方法
    public onLoad(params: any): void {
        this._loadParams = params
        this._isLoaded = true
        
        // 执行用户提供的回调函数
        if (this._onLoad) {
            this._onLoad(params)
        }
    }

    public onUnload(): void {
        this._isLoaded = false
        this._loadParams = null
        
        // 清理子视图
        this.clearChildren()
        // 清空操作栈
        this.operationStack.clear()
        
        // 执行用户提供的回调函数
        if (this._onUnload) {
            this._onUnload()
        }
    }

    public onShow(): void {
        this._isVisible = true
        
        // 执行用户提供的回调函数
        if (this._onShow) {
            this._onShow()
        }
    }

    public onHide(): void {
        this._isVisible = false
        
        // 执行用户提供的回调函数
        if (this._onHide) {
            this._onHide()
        }
    }

    // 渲染方法
    public render(canvasContext: CanvasContext): void {
        if (!this._isVisible) {
            return
        }

        // 应用Scene级别的样式到两个上下文
        this.applySceneStyle(canvasContext)

        // 获取视口信息
        const viewport = this.getViewport()
        
        
        // 使用后序遍历渲染子视图，确保子节点优先渲染
        const renderOrder = this.getPostOrderTraversal()
        renderOrder.forEach(view => {
            if (view instanceof View) {
                // 使用View的getWorldMatrix方法获取世界矩阵
                const worldMatrix = view.getWorldMatrix()
                const mvpMatrix = this.calculateMVPMatrixFromWorld(worldMatrix)
                // 判断view是否在视口内
                if (this.isViewInViewport(view, mvpMatrix, viewport)) {
                    // 在视口内，直接调用view的render方法，传递MVP矩阵
                    view.render(canvasContext, mvpMatrix)
                }
                // 不在视口内，跳过渲染
            }
        })
    }

    // 应用Scene级别的样式
    private applySceneStyle(canvasContext: CanvasContext): void {
        // 应用样式到主画布上下文
        this.style.applyToContext(canvasContext.mainCtx)
        
        // 如果有离屏画布上下文，也应用样式
        if (canvasContext.bufferCtx) {
            this.style.applyToContext(canvasContext.bufferCtx)
        }
    }

    // 计算MVP矩阵 (Model-View-Projection) - 使用世界矩阵
    private calculateMVPMatrixFromWorld(worldMatrix: Matrix4): Matrix4 {
        // View-Projection矩阵：相机的VP矩阵
        if (this.camera) {
            const viewProjectionMatrix = this.camera.viewProjectionMatrix
            // MVP = VP * WorldMatrix
            return viewProjectionMatrix.copy().multiply(worldMatrix)
        }
        
        // 如果没有相机，只返回世界矩阵
        return worldMatrix.copy()
    }

    // 计算MVP矩阵 (Model-View-Projection) - 旧方法保留用于兼容
    private calculateMVPMatrix(view: View): Matrix4 {
        // Model矩阵：view的变换矩阵
        const modelMatrix = view.matrix
        
        // View-Projection矩阵：相机的VP矩阵
        if (this.camera) {
            const viewProjectionMatrix = this.camera.viewProjectionMatrix
            // MVP = VP * M
            return viewProjectionMatrix.copy().multiply(modelMatrix)
        }
        
        // 如果没有相机，只返回Model矩阵
        return modelMatrix.copy()
    }

    // 获取视口信息
    private getViewport(): { x: number, y: number, width: number, height: number } {
        if (this.camera) {
            // 从相机获取视口信息
            const size = this.camera.getSize()
            return {
                x: 0,
                y: 0,
                width: size.width,
                height: size.height
            }
        }
        
        // 默认视口（当没有相机时）
        return {
            x: 0,
            y: 0,
            width: 1000,
            height: 1000
        }
    }

    // 判断view是否在视口内
    private isViewInViewport(view: View, mvpMatrix: Matrix4, viewport: { x: number, y: number, width: number, height: number }): boolean {
        // 获取view的边界框（使用BoundingBoxAddon计算，包含内容大小和内边距）
        const bounds = view.getBounds()
        if (!bounds) {
            return false
        }

        // 将边界框的四个角点通过MVP矩阵变换到屏幕空间
        const corners = [
            { x: bounds.x, y: bounds.y },                    // 左上
            { x: bounds.x + bounds.width, y: bounds.y },     // 右上
            { x: bounds.x, y: bounds.y + bounds.height },    // 左下
            { x: bounds.x + bounds.width, y: bounds.y + bounds.height } // 右下
        ]

        // 变换所有角点到屏幕空间
        const transformedCorners = corners.map(corner => {
            // 将2D点转换为齐次坐标，创建4x1列向量矩阵
            const pointMatrix = new Matrix4([
                [corner.x],
                [corner.y],
                [0],
                [1]
            ])

            // 使用矩阵左乘列向量
            const transformedPoint = mvpMatrix.copy().multiply(pointMatrix)
            const transform = transformedPoint.transform

            // 提取变换后的坐标 (行主序)
            const screenX = transform[0]  // 第一行第一列
            const screenY = transform[4]  // 第二行第一列
            const screenW = transform[12] // 第四行第一列

            // 透视除法
            if (screenW !== 0) {
                return {
                    x: screenX / screenW,
                    y: screenY / screenW
                }
            } else {
                return { x: screenX, y: screenY }
            }
        })

        // 计算变换后边界框的包围盒
        const minX = Math.min(...transformedCorners.map(c => c.x))
        const maxX = Math.max(...transformedCorners.map(c => c.x))
        const minY = Math.min(...transformedCorners.map(c => c.y))
        const maxY = Math.max(...transformedCorners.map(c => c.y))

        // 检查是否与视口相交
        return !(
            maxX < viewport.x ||
            minX > viewport.x + viewport.width ||
            maxY < viewport.y ||
            minY > viewport.y + viewport.height
        )
    }


    // 子视图管理
    public addChild(child: View): Scene {
        if (!this.children.includes(child)) {
            // 创建操作前的快照
            const oldSceneSnapshot = OperationStack.createSceneSnapshot(this, 'Before add child')
            
            // 设置子视图的层级
            this.setChildLayer(child)
            
            this.children.push(child)
            child.parent = this
            child.onAttach()
            
            // 创建操作后的快照
            const newSceneSnapshot = OperationStack.createSceneSnapshot(this, 'After add child')
            
            // 记录操作
            const operation = OperationStack.createOperation(
                { old: oldSceneSnapshot, new: newSceneSnapshot },
                'add',
                `Add child: ${child.id || 'unknown'}`
            )
            this.recordOperation(operation)
        }
        return this
    }

    public removeChild(child: View): Scene {
        const index = this.children.indexOf(child)
        if (index > -1) {
            // 创建操作前的快照
            const oldSceneSnapshot = OperationStack.createSceneSnapshot(this, 'Before remove child')
            
            this.children.splice(index, 1)
            child.parent = null
            
            // 创建操作后的快照
            const newSceneSnapshot = OperationStack.createSceneSnapshot(this, 'After remove child')
            
            // 记录操作
            const operation = OperationStack.createOperation(
                { old: oldSceneSnapshot, new: newSceneSnapshot },
                'remove',
                `Remove child: ${child.id || 'unknown'}`
            )
            this.recordOperation(operation)
        }
        return this
    }

    public insertChild(child: View, index: number): Scene {
        if (index >= 0 && index <= this.children.length) {
            // 创建操作前的快照
            const oldSceneSnapshot = OperationStack.createSceneSnapshot(this, 'Before insert child')
            
            this.children.splice(index, 0, child)
            child.parent = this
            child.onAttach()
            
            // 创建操作后的快照
            const newSceneSnapshot = OperationStack.createSceneSnapshot(this, 'After insert child')
            
            // 记录操作
            const operation = OperationStack.createOperation(
                { old: oldSceneSnapshot, new: newSceneSnapshot },
                'add',
                `Insert child: ${child.id || 'unknown'} at index ${index}`
            )
            this.recordOperation(operation)
        }
        return this
    }

    public clearChildren(): Scene {
        // 创建操作前的快照
        const oldSceneSnapshot = OperationStack.createSceneSnapshot(this, 'Before clear children')
        
        const children = [...this.children]
        this.children.forEach(child => {
            child.parent = null
        })
        this.children = []
        
        // 创建操作后的快照
        const newSceneSnapshot = OperationStack.createSceneSnapshot(this, 'After clear children')
        
        // 记录操作
        const operation = OperationStack.createOperation(
            { old: oldSceneSnapshot, new: newSceneSnapshot },
            'remove',
            `Clear all children (${children.length} items)`
        )
        this.recordOperation(operation)
        
        return this
    }

    public getChildCount(): number {
        return this.children.length
    }

    public getChild(index: number): View | null {
        return this.children[index] || null
    }

    public findChildById(id: string): View | null {
        for (const child of this.children) {
            if (child.id === id) {
                return child
            }
            const found = child.findById(id)
            if (found) {
                return found
            }
        }
        return null
    }

    // 快照应用器
    private applySnapshot(snapshot: SceneSnapshot | null): void {
        if (!snapshot) {
            return
        }
        
        try {
            // 从快照恢复Scene状态
            const restoredScene = OperationStack.restoreSceneFromSnapshot(snapshot)
            if (restoredScene) {
                // 更新当前Scene的状态
                this.children = restoredScene.children
                this.data = restoredScene.data
                this.camera = restoredScene.camera
            }
        } catch (error) {
            console.error('Failed to apply snapshot:', error)
        }
    }

    // 操作栈管理
    public recordOperation(operation: Operation): void {
        this.operationStack.push(operation)
    }

    public undo(): boolean {
        return this.operationStack.undo()
    }

    public redo(): boolean {
        return this.operationStack.redo()
    }

    public canUndo(): boolean {
        return this.operationStack.canUndo()
    }

    public canRedo(): boolean {
        return this.operationStack.canRedo()
    }

    public clearHistory(): void {
        this.operationStack.clear()
    }

    // 相机管理
    public setCamera(camera: BaseCamera): Scene {
        this.camera = camera
        return this
    }

    public getCamera(): BaseCamera {
        return this.camera
    }

    // 数据管理
    public setData(data: any): Scene {
        this.data = data
        return this
    }

    public getData(): any {
        return this.data
    }

    // 生命周期回调管理
    public setOnLoad(callback: (params: any) => void): Scene {
        this._onLoad = callback
        return this
    }

    public setOnUnload(callback: () => void): Scene {
        this._onUnload = callback
        return this
    }

    public setOnShow(callback: () => void): Scene {
        this._onShow = callback
        return this
    }

    public setOnHide(callback: () => void): Scene {
        this._onHide = callback
        return this
    }

    // 状态查询
    public isLoaded(): boolean {
        return this._isLoaded
    }

    public isVisible(): boolean {
        return this._isVisible
    }

    public getLoadParams(): any {
        return this._loadParams
    }

    // 场景管理
    public load(params: any = {}): Scene {
        this.onLoad(params)
        return this
    }

    public unload(): Scene {
        this.onUnload()
        return this
    }

    public show(): Scene {
        this.onShow()
        return this
    }

    public hide(): Scene {
        this.onHide()
        return this
    }

    // 遍历方法
    public traverse(callback: (view: View) => void): void {
        this.children.forEach(child => child.traverse(callback))
    }

    public traverseReverse(callback: (view: View) => void): void {
        this.children.forEach(child => child.traverseReverse(callback))
    }

    // 后序遍历方法 - 用于渲染顺序
    private getPostOrderTraversal(): View[] {
        const result: View[] = []
        
        // 递归后序遍历函数
        const postOrderTraverse = (views: View[]) => {
            views.forEach(view => {
                // 先遍历子节点（只有CombinedView有子节点）
                if (view instanceof CombinedView) {
                    const children = view.getChildren()
                    if (children && children.length > 0) {
                        postOrderTraverse(children)
                    }
                }
                // 再处理当前节点
                result.push(view)
            })
        }
        
        // 按层级排序后开始后序遍历
        const sortedChildren = this.getChildrenSortedByLayer()
        postOrderTraverse(sortedChildren)
        
        return result
    }

    // 查找方法
    public findByType(type: string): View[] {
        const results: View[] = []
        
        this.children.forEach(child => {
            if (child.type === type) {
                results.push(child)
            }
            // 注意：这里需要根据View类的实际findByType方法签名来调整
            // 如果View的findByType接受VIEWTYPE，需要转换类型
            try {
                results.push(...child.findByType(type as any))
            } catch (e) {
                // 如果类型不匹配，跳过递归查找
            }
        })
        
        return results
    }

    // 复制场景
    public copy(): Scene {
        const newScene = new Scene(this.camera)
        
        // 复制基本属性
        newScene.id = this.generateId()
        newScene.data = { ...this.data }
        
        // 复制子视图
        this.children.forEach(child => {
            newScene.addChild(child.copy())
        })
        
        return newScene
    }

    // 生成唯一ID
    private generateId(): string {
        return uuidv4()
    }

    // 获取子视图
    public getChildren(): View[] {
        return [...this.children]
    }

    // 层级管理方法
    /**
     * 设置子视图的层级（在添加时自动调用）
     */
    private setChildLayer(child: View): void {
        if (this.children.length === 0) {
            // 第一个子视图，层级设为0
            child.layer = 0
        } else {
            // 获取当前最大层级
            const maxLayer = Math.max(...this.children.map(c => c.layer))
            // 新子视图的层级设为最大层级+1
            child.layer = maxLayer + 1
        }
    }

    /**
     * 按层级顺序获取子视图（层级低的先返回）
     */
    public getChildrenSortedByLayer(): View[] {
        return [...this.children].sort((a, b) => a.layer - b.layer)
    }

    /**
     * 将视图移到最前面（置顶）
     */
    public bringToFront(view: View): Scene {
        if (!this.children.includes(view)) {
            return this
        }

        // 创建操作前的快照
        const oldSceneSnapshot = OperationStack.createSceneSnapshot(this, 'Before bring to front')
        
        // 获取当前最大层级
        const maxLayer = Math.max(...this.children.map(c => c.layer))
        const newLayer = maxLayer + 1
        
        // 更新视图及其子视图的层级
        this.updateViewLayer(view, newLayer)
        
        // 检查是否需要更新父视图层级
        this.updateParentLayerIfNeeded(view)
        
        // 创建操作后的快照
        const newSceneSnapshot = OperationStack.createSceneSnapshot(this, 'After bring to front')
        
        // 记录操作
        const operation = OperationStack.createOperation(
            { old: oldSceneSnapshot, new: newSceneSnapshot },
            'layer',
            `Bring to front: ${view.id || 'unknown'}`
        )
        this.recordOperation(operation)
        
        return this
    }

    /**
     * 将视图移到最后面（置底）
     */
    public sendToBack(view: View): Scene {
        if (!this.children.includes(view)) {
            return this
        }

        // 创建操作前的快照
        const oldSceneSnapshot = OperationStack.createSceneSnapshot(this, 'Before send to back')
        
        // 获取当前最小层级
        const minLayer = Math.min(...this.children.map(c => c.layer))
        const newLayer = minLayer - 1
        
        // 更新视图及其子视图的层级
        this.updateViewLayer(view, newLayer)
        
        // 检查是否需要更新父视图层级
        this.updateParentLayerIfNeeded(view)
        
        // 创建操作后的快照
        const newSceneSnapshot = OperationStack.createSceneSnapshot(this, 'After send to back')
        
        // 记录操作
        const operation = OperationStack.createOperation(
            { old: oldSceneSnapshot, new: newSceneSnapshot },
            'layer',
            `Send to back: ${view.id || 'unknown'}`
        )
        this.recordOperation(operation)
        
        return this
    }

    /**
     * 将视图上移一层
     */
    public bringForward(view: View): Scene {
        if (!this.children.includes(view)) {
            return this
        }

        // 创建操作前的快照
        const oldSceneSnapshot = OperationStack.createSceneSnapshot(this, 'Before bring forward')
        
        // 获取当前层级
        const currentLayer = view.layer
        
        // 找到比当前层级大的最小层级
        const higherLayers = this.children
            .filter(c => c.layer > currentLayer)
            .map(c => c.layer)
            .sort((a, b) => a - b)
        
        if (higherLayers.length > 0) {
            // 交换层级
            const targetLayer = higherLayers[0]
            const targetView = this.children.find(c => c.layer === targetLayer)
            
            if (targetView) {
                // 交换两个视图的层级
                this.updateViewLayer(view, targetLayer)
                this.updateViewLayer(targetView, currentLayer)
                
                // 检查是否需要更新父视图层级
                this.updateParentLayerIfNeeded(view)
                this.updateParentLayerIfNeeded(targetView)
            }
        } else {
            // 没有更高的层级，直接增加层级
            this.updateViewLayer(view, currentLayer + 1)
            this.updateParentLayerIfNeeded(view)
        }
        
        // 创建操作后的快照
        const newSceneSnapshot = OperationStack.createSceneSnapshot(this, 'After bring forward')
        
        // 记录操作
        const operation = OperationStack.createOperation(
            { old: oldSceneSnapshot, new: newSceneSnapshot },
            'layer',
            `Bring forward: ${view.id || 'unknown'}`
        )
        this.recordOperation(operation)
        
        return this
    }

    /**
     * 将视图下移一层
     */
    public sendBackward(view: View): Scene {
        if (!this.children.includes(view)) {
            return this
        }

        // 创建操作前的快照
        const oldSceneSnapshot = OperationStack.createSceneSnapshot(this, 'Before send backward')
        
        // 获取当前层级
        const currentLayer = view.layer
        
        // 找到比当前层级小的最大层级
        const lowerLayers = this.children
            .filter(c => c.layer < currentLayer)
            .map(c => c.layer)
            .sort((a, b) => b - a)
        
        if (lowerLayers.length > 0) {
            // 交换层级
            const targetLayer = lowerLayers[0]
            const targetView = this.children.find(c => c.layer === targetLayer)
            
            if (targetView) {
                // 交换两个视图的层级
                this.updateViewLayer(view, targetLayer)
                this.updateViewLayer(targetView, currentLayer)
                
                // 检查是否需要更新父视图层级
                this.updateParentLayerIfNeeded(view)
                this.updateParentLayerIfNeeded(targetView)
            }
        } else {
            // 没有更低的层级，直接减少层级
            this.updateViewLayer(view, currentLayer - 1)
            this.updateParentLayerIfNeeded(view)
        }
        
        // 创建操作后的快照
        const newSceneSnapshot = OperationStack.createSceneSnapshot(this, 'After send backward')
        
        // 记录操作
        const operation = OperationStack.createOperation(
            { old: oldSceneSnapshot, new: newSceneSnapshot },
            'layer',
            `Send backward: ${view.id || 'unknown'}`
        )
        this.recordOperation(operation)
        
        return this
    }

    /**
     * 设置视图到指定层级
     */
    public setLayer(view: View, layer: number): Scene {
        if (!this.children.includes(view)) {
            return this
        }

        // 创建操作前的快照
        const oldSceneSnapshot = OperationStack.createSceneSnapshot(this, 'Before set layer')
        
        // 更新视图及其子视图的层级
        this.updateViewLayer(view, layer)
        
        // 检查是否需要更新父视图层级
        this.updateParentLayerIfNeeded(view)
        
        // 创建操作后的快照
        const newSceneSnapshot = OperationStack.createSceneSnapshot(this, 'After set layer')
        
        // 记录操作
        const operation = OperationStack.createOperation(
            { old: oldSceneSnapshot, new: newSceneSnapshot },
            'layer',
            `Set layer: ${view.id || 'unknown'} to ${layer}`
        )
        this.recordOperation(operation)
        
        return this
    }

    /**
     * 更新视图及其所有子视图的层级
     */
    private updateViewLayer(view: View, newLayer: number): void {
        const layerDiff = newLayer - view.layer
        view.layer = newLayer
        
        // 递归更新所有子视图的层级
        view.traverse(child => {
            if (child !== view) {
                child.layer += layerDiff
            }
        })
    }

    /**
     * 检查并更新父视图的层级（如果需要）
     */
    private updateParentLayerIfNeeded(view: View): void {
        if (!view.parent || !(view.parent instanceof View)) {
            return
        }
        
        const parent = view.parent as View
        const siblings = parent.getChildren()
        
        if (siblings.length === 0) {
            return
        }
        
        // 检查当前视图是否为父视图直接子元素中最大层级的元素
        const maxSiblingLayer = Math.max(...siblings.map((s: View) => s.layer))
        if (view.layer === maxSiblingLayer) {
            // 更新父视图层级为子视图最大层级
            parent.layer = maxSiblingLayer
        }
        
        // 检查当前视图是否为父视图直接子元素中最小层级的元素
        const minSiblingLayer = Math.min(...siblings.map((s: View) => s.layer))
        if (view.layer === minSiblingLayer) {
            // 更新父视图层级为子视图最小层级
            parent.layer = minSiblingLayer
        }
    }

    /**
     * 获取指定视图的层级
     */
    public getLayer(view: View): number {
        return view.layer
    }

    /**
     * 获取所有子视图的层级信息
     */
    public getLayerInfo(): Array<{ view: View, layer: number }> {
        return this.children.map(view => ({
            view,
            layer: view.layer
        })).sort((a, b) => a.layer - b.layer)
    }

    // 静态方法：创建和合并View
    /**
     * 创建图形视图
     */
    public static createGraphView(graph: any, options: GraphViewOptions = {}): GraphView {
        return new GraphView(graph, options)
    }

    /**
     * 创建图像视图
     */
    public static createImageView(image: any, options: ImageViewOptions = {}): ImageView {
        return new ImageView(image, options)
    }

    /**
     * 创建视频视图
     */
    public static createVideoView(video: any, options: VideoViewOptions = {}): VideoView {
        return new VideoView(video, options)
    }

    /**
     * 创建文本视图
     */
    public static createTextView(text: any, options: TextViewOptions = {}): TextView {
        return new TextView(text, options)
    }

    /**
     * 创建组合视图
     */
    public static createCombinedView(views: View[] = [], options: CombinedViewOptions = {}): CombinedView {
        return new CombinedView(views, options)
    }

    /**
     * 合并多个视图
     * 计算合并后view的matrix，并调整原view的matrix
     */
    public static mergeViews(views: View[]): CombinedView {
        if (views.length === 0) {
            return new CombinedView([])
        }

        if (views.length === 1) {
            const singleView = views[0]
            const combinedView = new CombinedView([singleView])
            // 直接使用单个view的matrix
            combinedView.setTransform(singleView.matrix.copy())
            // 将单个view的matrix重置为单位矩阵，因为变换已经应用到CombinedView
            singleView.setTransform(Matrix4.identity())
            return combinedView
        }

        // 计算所有view的边界框
        let minX = Infinity, minY = Infinity
        let maxX = -Infinity, maxY = -Infinity

        views.forEach(view => {
            const bounds = view.getContentBounds()
            if (bounds) {
                minX = Math.min(minX, bounds.x)
                minY = Math.min(minY, bounds.y)
                maxX = Math.max(maxX, bounds.x + bounds.width)
                maxY = Math.max(maxY, bounds.y + bounds.height)
            }
        })

        if (minX === Infinity) {
            return new CombinedView(views)
        }

        // 计算合并后view的中心点
        const centerX = (minX + maxX) / 2
        const centerY = (minY + maxY) / 2

        // 创建合并后的CombinedView
        const mergedView = new CombinedView([])

        // 调整每个原view的matrix，使其相对于合并后view的坐标系
        views.forEach(view => {
            // 保存原view的matrix
            const originalMatrix = view.matrix.copy()
            
            // 计算原view相对于合并中心的偏移
            const bounds = view.getContentBounds()
            if (bounds) {
                const viewCenterX = bounds.x + bounds.width / 2
                const viewCenterY = bounds.y + bounds.height / 2
                
                // 计算偏移量
                const offsetX = viewCenterX - centerX
                const offsetY = viewCenterY - centerY
                
                // 创建新的matrix：先应用原变换，再应用偏移
                const newMatrix = originalMatrix.copy()
                newMatrix.translate(offsetX, offsetY, 0)
                
                // 设置新的matrix
                view.setTransform(newMatrix)
            }
            
            // 添加到合并后的view
            mergedView.addChild(view)
        })

        // 设置合并后view的matrix为合并中心的位置
        mergedView.setTransform(Matrix4.translation(centerX, centerY, 0))

        return mergedView
    }

    /**
     * 拆分组合视图
     * 将子view的matrix正确变换回独立状态
     */
    public static splitView(view: any): View[] {
        if (!view || !view.content || !Array.isArray(view.content)) {
            return [view]
        }

        const combinedView = view as CombinedView
        const childViews = [...combinedView.content]
        
        // 获取父view的世界矩阵
        const parentWorldMatrix = combinedView.getWorldMatrix()
        
        // 为每个子view计算独立后的matrix
        childViews.forEach(childView => {
            // 获取子view的当前世界矩阵
            const childWorldMatrix = childView.getWorldMatrix()
            
            // 计算子view的本地matrix（相对于父view的变换）
            const childLocalMatrix = childView.matrix.copy()
            
            // 计算子view独立后的matrix
            // 独立后的matrix = 子view的世界矩阵（因为父view的变换已经包含在内）
            const independentMatrix = childWorldMatrix.copy()
            
            // 设置子view的matrix为独立后的matrix
            childView.setTransform(independentMatrix)
            
            // 清除父引用
            childView.parent = null
        })

        return childViews
    }

}
