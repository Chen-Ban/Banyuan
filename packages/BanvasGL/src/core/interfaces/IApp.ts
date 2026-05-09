/**
 * App 接口层 —— 零循环依赖
 *
 * App 的公共接口定义。
 * 社区插件通过 interface 访问应用对象，无需 import 具体 class。
 */

import type { IScene } from './IScene'
import type { IRenderer, IRendererOptions } from './IRenderer'

// ────────────────────────────────────────────
//  App 相关类型
// ────────────────────────────────────────────

/**
 * 应用运行模式
 *
 * - edit：    编辑模式（默认）。canvas 事件由编辑器拦截，处理 select/move/resize 等设计操作；
 *             View 上的用户事件（onClick 等）不触发，FlowSchema 不执行。
 * - preview： 预览/运行模式。canvas 事件交由运行时处理，命中 View 后触发对应 FlowSchema；
 *             编辑器交互（BoundingBox、选中框等）不响应。
 */
export type AppMode = 'edit' | 'preview'

/** 页面类型（等价于 IScene） */
export type IPage = IScene

/** App 配置选项 */
export interface IAppOptions {
    enablePageStack?: boolean
    maxPageStackSize?: number
    onLaunch?: (params: any) => void
    onUnlaunch?: () => void
}

/** 导航选项 */
export interface INavigationOptions {
    replace?: boolean
    clearStack?: boolean
    params?: any
}

// ────────────────────────────────────────────
//  App 接口
// ────────────────────────────────────────────

/** App 的公共契约 */
export interface IApp {
    scenes: IScene[]
    renderer: IRenderer
    pageStack: IScene[]

    /** 当前运行模式，默认 'edit' */
    mode: AppMode
    /** 切换运行模式 */
    setMode(mode: AppMode): IApp

    // 生命周期
    onLaunch(params: any): void
    onUnlaunch(): void
    launch(params?: any): IApp
    unlaunch(): IApp

    // 场景管理
    addScene(scene: IScene): IApp
    removeScene(scene: IScene): IApp
    getScene(id: string): IScene | null
    getScenes(): IScene[]
    clearScenes(): IApp

    // 导航
    navigateTo(page: IPage, options?: INavigationOptions): IApp
    navigateBack(page?: IPage): IApp
    navigateForward(): IApp
    replaceTo(page: IPage, options?: INavigationOptions): IApp
    navigate(n: number): IApp

    // 页面栈
    clearPageStack(): IApp
    getPageStack(): IPage[]
    getPageStackSize(): number

    // 当前场景
    getCurrentScene(): IScene | null
    setCurrentScene(scene: IScene): IApp

    // 渲染
    render(): IApp
    startRenderLoop(fps?: number): IApp
    stopRenderLoop(): IApp
    pauseRenderLoop(): IApp
    resumeRenderLoop(): IApp
    setTargetFPS(fps: number): IApp
    getRenderStatus(): {
        isRendering: boolean
        renderLoop: boolean
        targetFPS: number
        frameInterval: number
    }

    // 用户回调
    setUserOnLaunch(callback: (params: any) => void): IApp
    setUserOnUnlaunch(callback: () => void): IApp
    removeUserOnLaunch(): IApp
    removeUserOnUnlaunch(): IApp
    getUserLifecycleStatus(): {
        hasUserOnLaunch: boolean
        hasUserOnUnlaunch: boolean
    }

    // 序列化
    initFromSerializedScenes(serializedScenes: string[]): IApp
    toString(): string

    // 状态查询
    isLaunched(): boolean
    getLaunchParams(): any
    hasCurrentScene(): boolean
    canNavigateBack(): boolean

    // 页面栈配置
    setPageStackEnabled(enabled: boolean): IApp
    getCurrentPage(): IScene
    setMaxPageStackSize(size: number): IApp
    isPageStackEnabled(): boolean
    getMaxPageStackSize(): number

    // 渲染器管理
    getRenderer(): IRenderer
    setRenderer(renderer: IRenderer): IApp

    // 批量操作
    beginBatchOperation(): IApp
    endBatchOperation(): IApp

    // 事件
    handleResize(width: number, height: number): IApp

    // 销毁
    destroy(): IApp
}

/** 静态工厂方法（需要 canvas 和具体 Renderer，故由消费者直接调用 App.create） */
export interface IAppStatic {
    create(
        canvas: HTMLCanvasElement,
        options?: IAppOptions,
        rendererOptions?: IRendererOptions
    ): IApp
}
