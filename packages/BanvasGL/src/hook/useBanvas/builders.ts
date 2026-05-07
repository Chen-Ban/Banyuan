/**
 * 数据构建工具函数
 *
 * 将内部 View / Scene 实例转换为只读的 IViewNode / IPageNode 描述对象，
 * 供 React 层渲染 Layers 面板使用。
 */

import type { IViewNode, IPageNode } from '@/core/interfaces'
import type View from '@/core/views/View/View'
import type Scene from '@/core/scene/Scene'
import type { App } from '@/core/app'
import { VIEWTYPE } from '@/core/constants'

/**
 * 根据 View type 和 id 生成默认显示名称
 */
function getViewDisplayName(view: View): string {
    return view.name
}

/**
 * 递归构建视图树节点
 */
export function buildViewNode(view: View, depth: number = 0): IViewNode {
    const graphType = view.content?.type ?? undefined

    return {
        id: view.id,
        type: view.type,
        graphType,
        name: getViewDisplayName(view),
        visible: view.visible,
        locked: view.freezed,
        selected: view.selected,
        actived: view.actived,
        depth,
        children: view.children.map((child) => buildViewNode(child as View, depth + 1)),
    }
}

/**
 * 构建单个页面节点
 */
export function buildPageNode(scene: Scene, index: number, isCurrent: boolean): IPageNode {
    const sceneName = scene.name
    return {
        id: scene.id,
        name: sceneName,
        isCurrent,
        index,
        children: scene.children
            .filter((child) => (child as View).type !== VIEWTYPE.SELECTBOXVIEW)
            .map((child) => buildViewNode(child as View, 0)),
    }
}

/**
 * 构建完整的页面列表（含容器树）
 */
export function buildPageNodes(app: App): IPageNode[] {
    const currentScene = app.getCurrentScene()
    return app.scenes.map((scene, index) =>
        buildPageNode(scene as Scene, index, scene === currentScene)
    )
}
