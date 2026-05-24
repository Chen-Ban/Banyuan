/**
 * 数据构建工具函数
 */

import { ViewType } from '@banyuan/banvasgl'
import type { IViewNode, IPageNode, IFieldSchemaMap, App, View, Scene } from '@banyuan/banvasgl'

function getViewDisplayName(view: View): string {
    return view.name
}

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

export function buildPageNode(scene: Scene, index: number, isCurrent: boolean): IPageNode {
    const sceneName = scene.name
    return {
        id: scene.id,
        name: sceneName,
        isCurrent,
        index,
        data: (scene.data ?? {}) as IFieldSchemaMap,
        children: scene.children
            .filter((child) => (child as View).type !== ViewType.SELECTBOXVIEW)
            .map((child) => buildViewNode(child as View, 0)),
    }
}

export function buildPageNodes(app: App): IPageNode[] {
    const currentScene = app.getCurrentScene()
    return app.scenes.map((scene, index) =>
        buildPageNode(scene as Scene, index, scene === currentScene)
    )
}
