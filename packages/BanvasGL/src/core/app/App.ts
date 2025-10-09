import Scene from '../scene/Scene'
import Serializer from '../utils/Serializer'
import Renderer, { RendererOptions } from '../renderer/Renderer'
import Style from '../style/Style'

// 页面类型
export type Page = Scene

// 应用选项
export interface AppOptions {
    style?: Style
    enablePageStack?: boolean
    maxPageStackSize?: number
    onLaunch?: (params: any) => void
    onUnlaunch?: () => void
}

// 导航选项
export interface NavigationOptions {
    replace?: boolean
    clearStack?: boolean
    params?: any
}

export default class App {
    // 基本属性
    public scenes: Scene[] = []
    public renderer: Renderer
    public pageStack: Scene[] = []
    public style: Style
    
    // 动态属性（索引签名）
    [key: string]: any
    
    // 私有属性
    private _currentScene: Scene | null = null
    private _currentPageIndex: number = -1 // 当前页面在栈中的索引
    private _isLaunched: boolean = false
    private _launchParams: any = null
    private _maxPageStackSize: number = 50
    private _enablePageStack: boolean = true
    private _pageStackHistory: Set<string> = new Set() // 记录已经在栈中的页面ID

    constructor(renderer: Renderer, options: AppOptions = {}) {
        this.renderer = renderer
        this.style = options.style || new Style()
        this._enablePageStack = options.enablePageStack !== false
        this._maxPageStackSize = options.maxPageStackSize || 50
        
        // 设置回调函数
        if (options.onLaunch) {
            this.onLaunch = options.onLaunch
        }
        if (options.onUnlaunch) {
            this.onUnlaunch = options.onUnlaunch
        }
    }

    // 生命周期方法
    public onLaunch(params: any): void {
        this._launchParams = params
        this._isLaunched = true
        // 子类可以重写此方法
    }

    public onUnlaunch(): void {
        this._isLaunched = false
        this._launchParams = null
        
        // 清理所有场景
        this.scenes.forEach(scene => {
            scene.unload()
        })
        this.scenes = []
        
        // 清空页面栈
        this.pageStack = []
        this._currentScene = null
        
        // 清空页面栈历史记录
        this._pageStackHistory.clear()
        
        // 子类可以重写此方法
    }

    // 启动应用
    public launch(params: any = {}): App {
        console.log('App launched');
        this.onLaunch(params)
        return this
    }

    // 关闭应用
    public unlaunch(): App {
        console.log('App unlaunched');
        this.onUnlaunch()
        return this
    }

    // 场景管理
    public addScene(scene: Scene): App {
        if (!this.scenes.includes(scene)) {
            this.scenes.push(scene)
        }
        return this
    }

    public removeScene(scene: Scene): App {
        const index = this.scenes.indexOf(scene)
        if (index > -1) {
            this.scenes.splice(index, 1)
            scene.unload()
        }
        return this
    }

    public getScene(id: string): Scene | null {
        return this.scenes.find(scene => scene.id === id) || null
    }

    public getScenes(): Scene[] {
        return [...this.scenes]
    }

    public clearScenes(): App {
        this.scenes.forEach(scene => scene.unload())
        this.scenes = []
        return this
    }

    // 导航方法
    public navigateTo(page: Page, options: NavigationOptions = {}): App {
        if (!this._enablePageStack) {
            return this.replaceTo(page, options)
        }

        // 隐藏当前场景
        if (this._currentScene) {
            this._currentScene.hide()
        }

        // 检查目标页面是否已经在栈中
        const isPageAlreadyInStack = this.isPageInStack(page)
        
        if (isPageAlreadyInStack) {
            // 如果页面已经在栈中，将其从栈中移除
            this.removePageFromStack(page)
        }

        // 将新页面推入栈顶
        this.pushToPageStack(page)
        
        // 设置当前页面指针指向栈顶（新页面）
        this._currentScene = page
        this._currentPageIndex = this.pageStack.length - 1
        this._currentScene.show()
        
        // 根据页面是否首次入栈决定调用onload还是onshow
        if (!isPageAlreadyInStack) {
            // 首次入栈，调用onload方法
            this._currentScene.load(options.params ?? {})
        } else {
            // 已在栈中，调用onshow方法
            this._currentScene.onShow()
        }

        return this
    }

    public navigateBack(page?: Page): App {
        if (!this._enablePageStack || this.pageStack.length <= 1 || this._currentPageIndex <= 0) {
            return this
        }

        // 隐藏当前场景
        if (this._currentScene) {
            this._currentScene.hide()
        }

        // 移动指针到上一个页面
        this._currentPageIndex--
        const previousPage = this.pageStack[this._currentPageIndex]
        if (previousPage) {
            this._currentScene = previousPage
            this._currentScene.show()
            // 返回时调用onshow方法
            this._currentScene.onShow()
        }

        return this
    }

    public navigateForward(): App {
        if (!this._enablePageStack || this.pageStack.length <= 1 || this._currentPageIndex >= this.pageStack.length - 1) {
            return this
        }

        // 隐藏当前场景
        if (this._currentScene) {
            this._currentScene.hide()
        }

        // 移动指针到下一个页面
        this._currentPageIndex++
        const nextPage = this.pageStack[this._currentPageIndex]
        if (nextPage) {
            this._currentScene = nextPage
            this._currentScene.show()
            // 前进时调用onshow方法
            this._currentScene.onShow()
        }

        return this
    }

    public replaceTo(page: Page, options: NavigationOptions = {}): App {
        // 隐藏当前场景
        if (this._currentScene) {
            this._currentScene.hide()
        }

        // 清空页面栈（如果指定）
        if (options.clearStack) {
            this.clearPageStack()
        } else {
            // 替换当前页面：从栈顶弹出当前页面
            if (this.pageStack.length > 0) {
                this.popFromPageStack()
            }
        }

        // 将新页面推入栈顶
        this.pushToPageStack(page)
        
        // 设置当前页面指针指向栈顶（新页面）
        this._currentScene = page
        this._currentPageIndex = this.pageStack.length - 1
        this._currentScene.show()
        
        // 替换页面时，根据页面是否在栈中决定调用onload还是onshow
        const isFirstTimeInStack = !this.isPageInStack(page)
        if (isFirstTimeInStack) {
            // 首次入栈，调用onload方法
            this._currentScene.load(options.params ?? {})
        } else {
            // 已在栈中，调用onshow方法
            this._currentScene.onShow()
        }

        return this
    }

    public navigate(n: number): App {
        if (n > 0) {
            // 后退n个页面（n为正数表示后退）
            for (let i = 0; i < n; i++) {
                this.navigateBack()
            }
        } else if (n < 0) {
            // 前进n个页面（n为负数表示前进）
            for (let i = 0; i < Math.abs(n); i++) {
                this.navigateForward()
            }
        }
        return this
    }

    // 页面栈管理
    private pushToPageStack(page: Page): void {
        if (!this._enablePageStack) {
            return
        }

        this.pageStack.push(page)
        this._pageStackHistory.add(page.id)
        
        // 限制栈大小
        if (this.pageStack.length > this._maxPageStackSize) {
            const removedPage = this.pageStack.shift()
            if (removedPage) {
                removedPage.unload()
                this._pageStackHistory.delete(removedPage.id)
            }
        }
    }

    private popFromPageStack(): Page | null {
        const page = this.pageStack.pop() || null
        if (page) {
            this._pageStackHistory.delete(page.id)
            // 更新当前页面索引
            if (this._currentPageIndex >= this.pageStack.length) {
                this._currentPageIndex = this.pageStack.length - 1
            }
        }
        return page
    }

    private removePageFromStack(page: Page): void {
        // 从页面栈中移除指定页面
        const index = this.pageStack.findIndex(p => p.id === page.id)
        if (index !== -1) {
            this.pageStack.splice(index, 1)
            // 更新当前页面索引
            if (index < this._currentPageIndex) {
                this._currentPageIndex--
            } else if (index === this._currentPageIndex) {
                // 如果移除的是当前页面，调整索引
                this._currentPageIndex = Math.min(this._currentPageIndex, this.pageStack.length - 1)
            }
        }
        
        // 从历史记录中移除
        this._pageStackHistory.delete(page.id)
    }

    private getTopPage(): Page | null {
        // 获取栈顶页面
        return this.pageStack.length > 0 ? this.pageStack[this.pageStack.length - 1] : null
    }

    // 检查页面是否在栈中
    private isPageInStack(page: Page): boolean {
        return this._pageStackHistory.has(page.id)
    }

    public clearPageStack(): App {
        this.pageStack.forEach(page => page.unload())
        this.pageStack = []
        this._pageStackHistory.clear()
        return this
    }

    public getPageStack(): Page[] {
        return [...this.pageStack]
    }

    public getPageStackSize(): number {
        return this.pageStack.length
    }

    // 当前场景管理
    public getCurrentScene(): Scene | null {
        return this._currentScene
    }

    public setCurrentScene(scene: Scene): App {
        if (this._currentScene) {
            this._currentScene.hide()
        }
        
        this._currentScene = scene
        this._currentScene.show()
        
        return this
    }

    // 渲染
    public render(): App {
        
        // 应用App级别的样式到渲染器的两个上下文
        this.applyAppStyle()
        
        if (this._currentScene) {
            console.log('开始渲染页面', this._currentScene.id);
            this.renderer.render(this._currentScene)
        } else {
            this.renderer.clear()
        }
        return this
    }

    // 从序列化的 Scene JSON 初始化
    public initFromSerializedScenes(serializedScenes: string[]): App {
        try {
            const scenes = (serializedScenes || []).map(json => Serializer.deserializeScene(json))
            scenes.forEach(scene => this.addScene(scene))
            if (scenes.length > 0) {
                this.setCurrentScene(scenes[0])
            }
        } catch (e) {
            console.warn('Failed to init scenes from serialized JSON:', e)
        }
        return this
    }

    // 应用App级别的样式
    private applyAppStyle(): void {
        const canvasContext = this.renderer.canvasContext
        
        // 应用样式到主画布上下文
        this.style.applyToContext(canvasContext.mainCtx)
        
        // 如果有离屏画布上下文，也应用样式
        if (canvasContext.bufferCtx) {
            this.style.applyToContext(canvasContext.bufferCtx)
        }
    }

    // 样式管理
    public setStyle(style: Style): App {
        this.style = style
        return this
    }

    public getStyle(): Style {
        return this.style
    }

    // 状态查询
    public isLaunched(): boolean {
        return this._isLaunched
    }

    public getLaunchParams(): any {
        return this._launchParams
    }

    public hasCurrentScene(): boolean {
        return this._currentScene !== null
    }

    public canNavigateBack(): boolean {
        return this.pageStack.length > 0
    }

    // 页面栈配置
    public setPageStackEnabled(enabled: boolean): App {
        this._enablePageStack = enabled
        if (!enabled) {
            this.clearPageStack()
        }
        return this
    }

    public setMaxPageStackSize(size: number): App {
        this._maxPageStackSize = Math.max(1, size)
        
        // 如果当前栈大小超过限制，移除多余的页面
        while (this.pageStack.length > this._maxPageStackSize) {
            const removedPage = this.pageStack.shift()
            if (removedPage) {
                removedPage.unload()
            }
        }
        
        return this
    }

    public isPageStackEnabled(): boolean {
        return this._enablePageStack
    }

    public getMaxPageStackSize(): number {
        return this._maxPageStackSize
    }

    // 渲染器管理
    public getRenderer(): Renderer {
        return this.renderer
    }

    public setRenderer(renderer: Renderer): App {
        this.renderer = renderer
        return this
    }

    // 应用信息
    public getAppInfo(): {
        isLaunched: boolean
        launchParams: any
        sceneCount: number
        currentScene: Scene | null
        pageStackSize: number
        maxPageStackSize: number
        pageStackEnabled: boolean
        rendererStats: any
    } {
        return {
            isLaunched: this._isLaunched,
            launchParams: this._launchParams,
            sceneCount: this.scenes.length,
            currentScene: this._currentScene,
            pageStackSize: this.pageStack.length,
            maxPageStackSize: this._maxPageStackSize,
            pageStackEnabled: this._enablePageStack,
            rendererStats: this.renderer.getStats()
        }
    }

    // 批量操作
    public beginBatchOperation(): App {
        // 暂停自动渲染
        return this
    }

    public endBatchOperation(): App {
        // 恢复自动渲染并渲染一次
        this.render()
        return this
    }

    // 事件处理
    public handleResize(width: number, height: number): App {
        this.renderer.resize(width, height)
        return this
    }

    // 销毁应用
    public destroy(): App {
        this.unlaunch()
        this.renderer.destroy()
        return this
    }

    // 静态方法：创建应用
    public static create(canvas: HTMLCanvasElement, options: AppOptions = {}, rendererOptions: RendererOptions = {}): App {
        const renderer = new Renderer(canvas, rendererOptions)
        return new App(renderer, options)
    }
}
