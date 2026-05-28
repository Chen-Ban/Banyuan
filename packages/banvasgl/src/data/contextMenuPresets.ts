/**
 * 右键菜单预设
 *
 * 提供设计态画布和视图的右键菜单项生成函数。
 * 业务方通过 hook 事件回调获取菜单项列表，渲染自定义的菜单 UI。
 */

import { isCombinedView } from '@/types/guards'
import { getClipboard } from '@/actions/viewActions'
import type { IContextMenuItem, IBanvasActions } from '@/types/hook/hook'
import type View from '@/view/View/View'
import type Scene from '@/engine/Scene'

export function createViewContextMenuItems(
    view: View,
    scene: Scene,
    actions: IBanvasActions,
): IContextMenuItem[] {
    const viewId = view.id
    const isLocked = view.freezed
    const isVisible = view.visible
    const siblings = scene.children
    const isTopmost = siblings[siblings.length - 1] === view
    const isBottommost = siblings[0] === view
    const hasClip = getClipboard() !== null
    const isCombined = isCombinedView(view)

    const activedViews = scene.getAllActived()
    const canGroup = activedViews.length >= 2
        && activedViews.every((v) => v.parent === activedViews[0].parent)

    const items: IContextMenuItem[] = [
        {
            key: 'copy',
            label: '复制',
            handler: () => actions.view.copy(viewId),
        },
        {
            key: 'paste',
            label: '粘贴（替换）',
            handler: () => actions.view.paste({ viewId }),
            disabled: !hasClip,
        },
        {
            key: 'delete',
            label: '删除',
            handler: () => actions.view.delete(viewId),
            disabled: isLocked,
            divider: true,
        },
        {
            key: 'lock',
            label: isLocked ? '解锁' : '锁定',
            handler: () => actions.view.setLocked(viewId, !isLocked),
        },
        {
            key: 'visible',
            label: isVisible ? '隐藏' : '显示',
            handler: () => actions.view.setVisible(viewId, !isVisible),
            divider: true,
        },
        {
            key: 'group',
            label: '组合',
            handler: () => {
                const ids = activedViews.map((v) => v.id)
                actions.view.group(ids)
            },
            disabled: !canGroup,
        },
        {
            key: 'ungroup',
            label: '取消组合',
            handler: () => actions.view.ungroup(viewId),
            disabled: !isCombined,
            divider: true,
        },
        {
            key: 'bringToFront',
            label: '置顶',
            handler: () => actions.view.bringToFront(viewId),
            disabled: isTopmost,
        },
        {
            key: 'sendToBack',
            label: '置底',
            handler: () => actions.view.sendToBack(viewId),
            disabled: isBottommost,
        },
    ]

    return items
}

export function createCanvasContextMenuItems(
    actions: IBanvasActions,
    position: { x: number; y: number },
): IContextMenuItem[] {
    const hasClip = getClipboard() !== null

    const items: IContextMenuItem[] = [
        {
            key: 'paste',
            label: '粘贴',
            handler: () => actions.view.paste({ position }),
            disabled: !hasClip,
        },
        {
            key: 'selectAll',
            label: '全选',
            handler: () => actions.view.selectAll(),
        },
    ]

    return items
}
