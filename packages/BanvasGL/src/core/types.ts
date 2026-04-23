/**
 * 共享接口文件 —— 零循环依赖
 *
 * 将 Scene 和 View 之间共享的类型契约抽取到这里，
 * 使得具体实现文件只依赖接口而非彼此的具体类，从而打破编译时循环依赖。
 */

import type { VIEWTYPE } from './constants'
import type Matrix4 from './math/Matrix4'
import type { Point3 } from './math'
import type { Graph } from './graph'
import type Bounds from './graph/base/Bounds'
import type { BoundingBoxAddonImpl } from './views/addon'

// ────────────────────────────────────────────
//  IView —— View 的公共接口
// ────────────────────────────────────────────
export interface IView {
    id: string
    readonly type: VIEWTYPE
    layer: number
    parent: ISceneNode | IView | null
    children: IView[]
    matrix: Matrix4
    content: Graph | null
    viewport: Bounds
    layoutArea: Bounds
    boundingBox: BoundingBoxAddonImpl | null

    // 状态
    selected: boolean
    actived: boolean
    freezed: boolean
    visible: boolean

    // 方法
    setActived(actived: boolean): IView
    setSelected(selected: boolean): IView
    render(): void
    copy(): IView
    onAttach(): void
    onDestroy(): void

    // 索引签名（View 原本就有）
    [key: string]: any
}

// ────────────────────────────────────────────
//  ISceneNode —— Scene 作为“容器节点”的接口
//  View 不再通过此接口访问 camera，仅作为父节点类型约束
// ────────────────────────────────────────────
export interface ISceneNode {
    id: string
    children: IView[]
    data: any
}

/**
 * 类型守卫：判断一个对象是否为 ISceneNode（而非 IView）。
 * 通过 duck-typing 检测：有 `children` 和 `data` 但没有 `type`（区分 View）。
 */
export function isSceneNode(obj: any): obj is ISceneNode {
    return obj != null && 'children' in obj && 'data' in obj && !('type' in obj)
}
