/**
 * Scene 接口层 —— 零循环依赖
 *
 * Scene 的公共接口定义。
 * 社区插件通过 interface 访问场景对象，无需 import 具体 class。
 *
 * 设计要点：
 *   - IScene 只引用 IView 和 ICamera，不引用具体类
 *   - OperationStack/Operation/Diff 作为独立的值类型接口在此处定义
 */

import type { IView } from './IView'
import type { ICamera } from './ICamera'

// ────────────────────────────────────────────
//  操作栈相关接口
// ────────────────────────────────────────────

/** 操作类型枚举 */
export { OperationType } from '@/core/scene/utils'

/** 操作差异记录 */
export interface IDiff {
    parentId: string
    id: string
    content: IView
    type: string // OperationType
}

/** 操作记录 */
export interface IOperation {
    diffs: IDiff[]
}

/** 操作栈接口 */
export interface IOperationStack {
    do(operation: IOperation): boolean
    undo(): boolean
    redo(): boolean
    clear(): void
}

// ────────────────────────────────────────────
//  Scene 接口
// ────────────────────────────────────────────

/** Scene 的公共契约 */
export interface IScene {
    id: string
    children: IView[]
    camera: ICamera
    data: any
    operationStack: IOperationStack

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
    recordOperation(operation: IOperation): boolean
    undo(): boolean
    redo(): boolean

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
    getChildrenSortedByLayer(): IView[]
    bringToFront(view: IView): IScene
    sendToBack(view: IView): IScene
    bringForward(view: IView): IScene
    sendBackward(view: IView): IScene
    setLayer(view: IView, layer: number): IScene
}
