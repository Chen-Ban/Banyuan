/**
 * Scene 接口层 —— 零循环依赖
 *
 * Scene 的公共接口定义。
 * 社区插件通过 interface 访问场景对象，无需 import 具体 class。
 *
 * 设计要点：
 *   - IScene 只引用 IView 和 ICamera，不引用具体类
 *   - Diff/Operation 相关类型从 utils 直接 re-export
 */

import type { IView, FlowSchema } from './IView'
import type { ICamera } from './ICamera'

// ────────────────────────────────────────────
//  操作栈相关类型（re-export）
// ────────────────────────────────────────────

export {
  DiffType,
  Operation,
} from '@/core/scene/operations'

export type {
  Diff,
  ModifyDiff,
  AddDiff,
  RemoveDiff,
  ReorderDiff,
  PropChange,
  ApplyDirection,
} from '@/core/scene/operations'

// ────────────────────────────────────────────
//  操作栈接口
// ────────────────────────────────────────────

/** 操作栈接口 */
export interface IOperationStack {
    do(operation: import('@/core/scene/operations').Operation): boolean
    undo(): boolean
    redo(): boolean
    clear(): void
    readonly canUndo: boolean
    readonly canRedo: boolean
}

// ────────────────────────────────────────────
//  Scene 接口
// ────────────────────────────────────────────

/**
 * 页面（Scene）用户生命周期钩子
 *
 * 与 View 的 lifetimes 设计一致，均使用 FlowSchema 描述用户逻辑，
 * 引擎在运行时将其编译执行。
 *
 * onLoad
 *   触发时机：页面首次加载时（navigateTo 目标页面，或应用启动时的首页）
 *   参数：导航时传入的 params 对象（如 navigateTo(id, { userId: '123' })）
 *   典型用途：根据路由参数初始化页面数据、发起数据请求
 *   注意：整个页面生命周期内只触发一次，页面返回前台不会重复触发
 *
 * onUnload
 *   触发时机：页面被销毁时（从页面栈中移除，如 navigateBack 后前一页被销毁）
 *   典型用途：清理页面级定时器、取消未完成的请求
 *   注意：页面进入后台（onHide）不会触发此钩子，只有真正销毁时才触发
 *
 * onShow
 *   触发时机：页面进入前台（首次加载后、或从其他页面返回时）
 *   与 onLoad 的区别：onLoad 只触发一次，onShow 每次页面可见都会触发
 *   典型用途：刷新列表数据、恢复动画、更新时间敏感的展示内容
 *
 * onHide
 *   触发时机：页面进入后台（跳转到其他页面时，当前页面未销毁但不可见）
 *   典型用途：暂停动画、停止轮询、保存草稿
 */
export interface ISceneLifetimes {
    onLoad:   FlowSchema | null
    onUnload: FlowSchema | null
    onShow:   FlowSchema | null
    onHide:   FlowSchema | null
}

/** Scene 的公共契约 */
export interface IScene {
    id: string
    children: IView[]
    camera: ICamera
    data: any
    lifetimes: ISceneLifetimes

    // 生命周期
    onLoad(params: any): void
    onUnload(): void
    onShow(): void
    onHide(): void

    // 选择
    getAllActived(): IView[]
    getSelectedView(): IView | undefined
    select(view?: IView, multiple?: boolean, deselect?: boolean): void

    // 渲染
    render(): void
    broadcastVPMatrix(): void

    // 子视图管理
    addChild(child: IView): IScene
    removeChild(child: IView): IScene
    clearChildren(): IScene

    // 操作栈
    undo(): boolean
    redo(): boolean
    readonly canUndo: boolean
    readonly canRedo: boolean

    // 事务管理
    beginTransaction(viewIds: string[]): void
    commitTransaction(): boolean
    rollbackTransaction(): void

    // 数据
    setData(data: any): IScene

    // 场景管理
    load(params?: any): IScene
    unload(): IScene
    show(): IScene
    hide(): IScene

    // 复制
    copy(): IScene

    // 查找
    findViewById(id: string): IView | undefined

    // 层级管理
    bringToFront(view: IView): IScene
    sendToBack(view: IView): IScene
    bringForward(view: IView): IScene
    sendBackward(view: IView): IScene
}
