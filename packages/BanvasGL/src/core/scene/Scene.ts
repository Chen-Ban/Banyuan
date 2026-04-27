import View from '@/core/views/View/View'
import { BaseCamera } from '@/core/camera'
import { OperationStack, Operation, LayerManager } from './utils'
import { v4 as uuidv4 } from 'uuid'
import { flattenViewTree, clearAllStates, clearSelectedStates, isViewInTree } from './ViewTree'
import type { ISceneNode } from '@/core/interfaces'

export interface SceneOptions {
    camera?: BaseCamera
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
    public data: any = {}
    public operationStack: OperationStack

    // 私有属性
    private _isLoaded: boolean = false
    private _isVisible: boolean = false
    private _loadParams: any = null
    private _selectedHistory: View[] = []

    // 传入的生命周期回调函数
    private _onLoad?: (params: any) => void
    private _onUnload?: () => void
    private _onShow?: () => void
    private _onHide?: () => void

    constructor(camera: BaseCamera, options: SceneOptions = {}) {
        this.camera = camera
        this.operationStack = new OperationStack(this.applyOperation.bind(this))

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

    public getAllActived() {
        return flattenViewTree(this).filter((v) => v.actived)
    }
    public getSelectedView() {
        return flattenViewTree(this).find((v) => v.selected)
    }

    public select(
        view: View | undefined = undefined,
        multiple: boolean = false,
        deselect: boolean = false
    ) {
        if (!view) {
            clearAllStates(this)
            return
        }
        // 查看传入的view是不是在这个列表中
        if (!isViewInTree(this, view)) {
            console.warn('指定的视图不在当前场景中')
            return
        }

        if (multiple) {
            clearSelectedStates(this, view)
            if (deselect && view.actived === true) {
                view.setActived(false).setSelected(false)
                this._selectedHistory.pop()
                if (this._selectedHistory.length > 0) {
                    this._selectedHistory[
                        this._selectedHistory.length - 1
                    ].setSelected(true)
                }
            } else {
                view.setActived(true).setSelected(true)
                this._selectedHistory.push(view)
            }
        } else {
            const selectedView = this.getSelectedView()
            if (selectedView && selectedView === view) {
                return
            }
            clearAllStates(this, view)
            view.setActived(true).setSelected(true)
        }
    }

    // 渲染方法
    public render(): void {
        if (!this._isVisible) {
            return
        }

        // 渲染前将 Camera 的 VP 矩阵广播到所有子 View
        this.broadcastVPMatrix()

        this.children.forEach((view) => {
            view.render()
        })
    }

    /**
     * 将当前 Camera 的 viewProjectionMatrix 广播到所有子 View。
     * 每帧渲染前调用一次，确保渲染和交互时使用的 VP 矩阵一致。
     */
    public broadcastVPMatrix(): void {
        const vpMatrix = this.camera.viewProjectionMatrix
        this.children.forEach((view) => view.setVPMatrix(vpMatrix))
    }

    // 子视图管理
    public addChild(child: View): this {
        if (!this.children.includes(child)) {
            // 设置子视图的层级
            this.setChildLayer(child)
            this.children.push(child)
            child.parent = this
            // 新加入的 View 立即获得当前 Camera 的 VP 矩阵
            child.setVPMatrix(this.camera.viewProjectionMatrix)
            child.onAttach()
        }
        return this
    }

    public removeChild(child: View): this {
        const index = this.children.indexOf(child)
        if (index > -1) {
            this.children.splice(index, 1)
            child.parent = null
        }
        return this
    }

    public clearChildren(): this {
        this.children.forEach((child) => {
            child.parent = null
        })
        this.children = []
        return this
    }

    private applyOperation(operation: Operation): void {
        //将operation应用到scene上
        for (let diff of operation.diffs) {
        }
    }

    // 操作栈管理
    public recordOperation(operation: Operation): boolean {
        return this.operationStack.do(operation)
    }

    public undo(): boolean {
        return this.operationStack.undo()
    }

    public redo(): boolean {
        return this.operationStack.redo()
    }
    // 数据管理
    public setData(data: any): this {
        this.data = data
        return this
    }
    // 场景管理
    public load(params: any = {}): this {
        this.onLoad(params)
        return this
    }
    public unload(): this {
        this.onUnload()
        return this
    }

    public show(): this {
        this.onShow()
        return this
    }

    public hide(): this {
        this.onHide()
        return this
    }

    // 复制场景
    public copy(): Scene {
        const newScene = new Scene(this.camera)

        // 复制基本属性
        newScene.id = this.generateId()
        newScene.data = { ...this.data }

        // 复制子视图
        this.children.forEach((child) => {
            newScene.addChild(child.copy())
        })

        return newScene
    }

    // 生成唯一ID
    private generateId(): string {
        return uuidv4()
    }

    public findViewById(id: string) {
        return flattenViewTree(this).find((view) => view.id === id)
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
            const maxLayer = Math.max(...this.children.map((c) => c.layer))
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
    public bringToFront(view: View): this {
        LayerManager.bringToFront(this.children, view)
        return this
    }

    /**
     * 将视图移到最后面（置底）
     */
    public sendToBack(view: View): this {
        LayerManager.sendToBack(this.children, view)
        return this
    }

    /**
     * 将视图上移一层
     */
    public bringForward(view: View): this {
        LayerManager.bringForward(this.children, view)
        return this
    }

    /**
     * 将视图下移一层
     */
    public sendBackward(view: View): this {
        LayerManager.sendBackward(this.children, view)
        return this
    }

    /**
     * 设置视图到指定层级
     */
    public setLayer(view: View, layer: number): this {
        LayerManager.setLayer(this.children, view, layer)
        return this
    }
}
