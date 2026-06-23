/**
 * useDesignContextMenu — 设计态右键菜单 hook
 *
 * 封装右键菜单的状态管理和菜单项生成逻辑。
 */

import { useCallback, useMemo, useState } from 'react'
import { isCombinedView, getClipboard } from '@banyuan/banvasgl'
import type { IBanvasActions, View } from '@banyuan/banvasgl'
import type { ContextMenuEvent } from '@/hooks/useInteraction'
import type { IContextMenuState, IContextMenuItem } from '@/types'

// ── 菜单项生成 ──

function createViewContextMenuItems(
    view: View,
    actions: IBanvasActions,
    onSaveMaterial?: (viewId: string) => void,
): IContextMenuItem[] {
    const viewId = view.id
    const isLocked = view.freezed
    const isVisible = view.visible
    const siblings = actions.page.getTopLevelViews()
    const isTopmost = siblings[siblings.length - 1] === view
    const isBottommost = siblings[0] === view
    const hasClip = getClipboard() !== null
    const isCombined = isCombinedView(view)

    const activedIds = actions.view.getActivedViewIds()
    const activedViews = activedIds
        .map((id) => actions.view.getViewInstance(id))
        .filter((v): v is View => v !== null)
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

    // ── 保存为物料（独立菜单项，分割线隔开） ──
    if (onSaveMaterial) {
        items.push({
            key: 'saveMaterial',
            label: '保存为物料',
            divider: true,
            handler: () => onSaveMaterial(viewId),
        })
    }

    return items
}

function createCanvasContextMenuItems(
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

// ── Hook ──

export interface UseDesignContextMenuResult {
    contextMenu: IContextMenuState
    onContextMenu: (event: ContextMenuEvent) => void
    /** 保存为物料弹窗控制 */
    saveMaterial: {
        open: boolean
        viewId: string
        close: () => void
        openFor: (viewId: string) => void
    }
}

export function useDesignContextMenu(
    actions: IBanvasActions | null,
): UseDesignContextMenuResult {
    const [saveMaterialOpen, setSaveMaterialOpen] = useState(false)
    const [saveMaterialViewId, setSaveMaterialViewId] = useState('')

    const closeSaveMaterial = useCallback(() => setSaveMaterialOpen(false), [])

    const defaultContextMenu: IContextMenuState = useMemo(
        () => ({
            visible: false,
            position: { x: 0, y: 0 },
            target: 'canvas',
            viewId: null,
            items: [],
            dismiss: () => {},
        }),
        [],
    )

    const [contextMenu, setContextMenu] = useState<IContextMenuState>(defaultContextMenu)

    const dismissContextMenu = useCallback(() => {
        setContextMenu((prev) => ({ ...prev, visible: false }))
    }, [])

    const handleSaveMaterial = useCallback((viewId: string) => {
        dismissContextMenu()
        setSaveMaterialViewId(viewId)
        setSaveMaterialOpen(true)
    }, [dismissContextMenu])

    const onContextMenu = useCallback(
        (event: ContextMenuEvent) => {
            if (!actions) return

            const view = event.targetId ? actions.view.getViewInstance(event.targetId) : null
            const target = view ? 'view' : 'canvas'

            const items: IContextMenuItem[] = view
                ? createViewContextMenuItems(view, actions, handleSaveMaterial)
                : createCanvasContextMenuItems(actions, event.canvasPosition)

            setContextMenu({
                visible: true,
                position: event.position,
                target,
                viewId: view?.id ?? null,
                items,
                dismiss: dismissContextMenu,
            })
        },
        [actions, dismissContextMenu, handleSaveMaterial],
    )

    const saveMaterial = useMemo(() => ({
        open: saveMaterialOpen,
        viewId: saveMaterialViewId,
        close: closeSaveMaterial,
        openFor: handleSaveMaterial,
    }), [saveMaterialOpen, saveMaterialViewId, closeSaveMaterial, handleSaveMaterial])

    return { contextMenu, onContextMenu, saveMaterial }
}
