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

import type { IView } from './IView'
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

/** Scene 的公共契约 */
export interface IScene {
    id: string
    children: IView[]
    camera: ICamera
    data: any

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
