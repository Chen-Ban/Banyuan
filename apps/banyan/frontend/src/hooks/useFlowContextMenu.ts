/**
 * useFlowContextMenu — 流程图右键菜单 hook
 *
 * 封装右键菜单的状态管理和菜单项生成逻辑。
 */

import { useCallback, useState } from 'react'
import { NodeView, EdgeView } from '@banyuan/banvasgl'
import type { IBanvasActions } from '@banyuan/banvasgl'
import type { FlowContextMenuEvent } from './useInteraction'
import type { FlowContextMenuItem, FlowContextMenuState } from '../components/FlowKit/FlowContextMenu'

// ── 菜单项生成 ──

function createNodeContextMenuItems(
    targetId: string,
    actions: IBanvasActions,
): FlowContextMenuItem[] {
    return [
        {
            key: 'delete-node',
            label: '删除节点',
            shortcut: 'Delete',
            handler: () => {
                // 删除关联连线
                const children = actions.page.getTopLevelViews()
                const relatedEdges = children.filter(
                    (v): v is EdgeView => v instanceof EdgeView &&
                        ((v.fromPortId?.startsWith(targetId + '_') ?? false) ||
                         (v.toPortId?.startsWith(targetId + '_') ?? false))
                )
                for (const edge of relatedEdges) {
                    actions.view.delete(edge.id)
                }
                actions.view.delete(targetId)
                actions.app.notify()
            },
        },
        {
            key: 'duplicate-node',
            label: '复制节点',
            handler: () => {
                const nodeView = actions.view.getViewInstance(targetId)
                if (!(nodeView instanceof NodeView)) return
                const originX = nodeView.matrix.get(0, 3)
                const originY = nodeView.matrix.get(1, 3)
                const clonedSchema = {
                    ...nodeView.schema,
                    id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                }
                const clonedView = new NodeView({
                    schema: clonedSchema,
                    style: { width: 140, height: 60 },
                })
                clonedView.translate(originX + 30, originY + 30, 0)
                actions.view.addTempChild(clonedView)
                actions.app.notify()
            },
        },
        {
            key: 'select-all',
            label: '全选',
            divider: true,
            handler: () => actions.view.selectAll(),
        },
    ]
}

function createEdgeContextMenuItems(
    targetId: string,
    actions: IBanvasActions,
): FlowContextMenuItem[] {
    return [
        {
            key: 'delete-edge',
            label: '删除连线',
            shortcut: 'Delete',
            handler: () => {
                actions.view.delete(targetId)
                actions.app.notify()
            },
        },
    ]
}

function createCanvasContextMenuItems(
    actions: IBanvasActions,
): FlowContextMenuItem[] {
    return [
        {
            key: 'select-all',
            label: '全选',
            handler: () => actions.view.selectAll(),
        },
        {
            key: 'clear-canvas',
            label: '清空画布',
            divider: true,
            handler: () => {
                const children = actions.page.getTopLevelViews()
                for (const v of children) {
                    actions.view.delete(v.id)
                }
                actions.app.notify()
            },
        },
    ]
}

// ── Hook ──

export interface UseFlowContextMenuResult {
    contextMenuState: FlowContextMenuState
    handleContextMenu: (event: FlowContextMenuEvent) => void
}

export function useFlowContextMenu(
    actions: IBanvasActions | null,
): UseFlowContextMenuResult {
    const [contextMenuState, setContextMenuState] = useState<FlowContextMenuState>({
        visible: false,
        position: { x: 0, y: 0 },
        targetType: 'canvas',
        targetId: null,
        items: [],
        dismiss: () => {},
    })

    const dismissMenu = useCallback(() => {
        setContextMenuState(prev => ({ ...prev, visible: false }))
    }, [])

    const handleContextMenu = useCallback((event: FlowContextMenuEvent) => {
        if (!actions) return

        let items

        if (event.targetType === 'node') {
            items = createNodeContextMenuItems(event.targetId!, actions)
        } else if (event.targetType === 'edge') {
            items = createEdgeContextMenuItems(event.targetId!, actions)
        } else {
            items = createCanvasContextMenuItems(actions)
        }

        setContextMenuState({
            visible: true,
            position: event.position,
            targetType: event.targetType,
            targetId: event.targetId,
            items,
            dismiss: dismissMenu,
        })
    }, [actions, dismissMenu])

    return { contextMenuState, handleContextMenu }
}
