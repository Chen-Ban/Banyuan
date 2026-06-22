/**
 * App 接口层 —— 零循环依赖
 *
 * App 的公共接口定义。
 * 社区插件通过 interface 访问应用对象，无需 import 具体 class。
 */

import type { IScene } from './scene'
import type { IRenderer, IRendererOptions } from './renderer'
import type { EventHandler } from '../view/view'
import type { IPlatformCanvas } from '../platform/canvas.js'

// ────────────────────────────────────────────
//  App 相关类型
// ────────────────────────────────────────────

/** 页面类型（等价于 IScene） */
export type IPage = IScene

/**
 * App 生命周期钩子
 *
 * 与 Scene.lifetimes / View.lifetimes 设计一致，均使用 lifetimes 字段汇聚生命周期回调。
 *
 * onLaunch
 *   触发时机：应用启动时（App.launch 被调用）
 *   参数：启动时传入的 params 对象
 *   典型用途：初始化应用级数据、设置全局状态
 *
 * onUnlaunch
 *   触发时机：应用关闭时（App.unlaunch 被调用）
 *   典型用途：清理应用级资源、取消订阅
 */
export interface IAppLifetimes {
    onLaunch: EventHandler
    onUnlaunch: EventHandler
}

/** App 配置选项 */
export interface IAppOptions {
    enablePageStack?: boolean
    maxPageStackSize?: number
    /** 是否允许 FlowSchema 执行。编辑态传 false，运行态传 true（默认 true）。 */
    flowEnabled?: boolean
    /** App 生命周期钩子 */
    lifetimes?: Partial<IAppLifetimes>
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
    /** App 生命周期钩子 */
    lifetimes: IAppLifetimes
    scenes: IScene[]
    renderer: IRenderer
    pageStack: IScene[]

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

    // 序列化
    serialize(): string
    initFromSerialized(json: string): IApp
    toJSON(): any
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

    // 设计尺寸
    getDesignSize(): { width: number; height: number }
    setDesignSize(width: number, height: number, dpr?: number): IApp

    // 销毁
    destroy(): IApp
}

/** 静态工厂方法（接受平台画布，由消费者直接调用 App.create） */
export interface IAppStatic {
    create(
        platform: IPlatformCanvas,
        options?: IAppOptions,
        rendererOptions?: IRendererOptions
    ): IApp
}
