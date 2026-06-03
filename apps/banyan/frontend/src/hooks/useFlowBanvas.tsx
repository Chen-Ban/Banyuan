import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
} from 'react'
import { useCanvasInit } from '@banyuan/banvasgl/react'
import type { SelectedViewPos } from '@banyuan/banvasgl/react'
import type { FlowSchema, FlowNode } from '@banyuan/banvasgl'
import { useInteraction } from './useInteraction'
import { useFlowContextMenu } from './useFlowContextMenu'
import { extractSchema } from '../components/FlowEditor/extractSchema'
import {
    NodeView,
    EdgeView,
} from '@banyuan/banvasgl'
import type { FlowContextMenuState } from '../components/FlowEditor/FlowContextMenu'

// ── 公共配置类型 ──

export interface UseFlowBanvasOptions {
    width: number
    height: number
    backgroundColor?: string
}

export interface UseFlowBanvasResult {
    /** 渲染好的 Canvas React 元素 */
    Canvas: React.ReactElement
    /**
     * 获取当前画布的 FlowSchema 快照
     *
     * 按需调用（如保存时），而非实时派生。
     * 内部遍历视图树序列化为纯数据结构。
     */
    getSchema: () => FlowSchema
    /**
     * 当前选中的视图 ID（空字符串表示无选中）
     */
    selectedViewId: string
    /**
     * 当前选中视图在 viewport 中的 CSS 坐标和尺寸（null 表示无选中）
     *
     * 消费方可直接用于 Popover / 属性面板浮层的绝对定位。
     */
    selectedViewPos: SelectedViewPos | null
    /**
     * 当前选中节点的完整 FlowNode schema（null 表示无选中或选中非 NodeView）
     */
    selectedNode: FlowNode | null
    /**
     * 右键菜单状态
     *
     * 业务方将此状态传给 `<FlowContextMenu state={contextMenuState} />` 即可渲染右键菜单。
     */
    contextMenuState: FlowContextMenuState
}

/**
 * 流程图画布专用 hook
 *
 * 设计原则：
 * - Scene 是 source of truth（NodeView.schema 存完整业务数据）
 * - selectedViewId / selectedViewPos 是派生的响应式状态
 * - schema 通过 getSchema() 按需获取（保存时调用），不做实时派生
 * - initialSchema 在首次初始化时加载到 Scene
 * - 拖拽创建节点由外层面板通过 drop 事件完成
 *
 * @param options 画布配置
 * @param initialSchema 初始加载的 FlowSchema（组件挂载时一次性加载）
 */
export default function useFlowBanvas(
    options: UseFlowBanvasOptions,
    initialSchema?: FlowSchema,
): UseFlowBanvasResult {
    const { width, height, backgroundColor } = options

    // ── 初始化：App + 容器 DOM + 相机交互 ──
    const { actions, elements, derived } = useCanvasInit('', {
        width,
        height,
        rendererOptions: backgroundColor
            ? { backgroundColor, clearColor: backgroundColor }
            : undefined,
    })

    const { selectedViewId, selectedViewPos, canvas } = derived

    // ── 初始化加载 ──
    const initializedRef = useRef(false)
    const initialSchemaRef = useRef(initialSchema)
    initialSchemaRef.current = initialSchema

    useEffect(() => {
        if (!actions || initializedRef.current) return
        initializedRef.current = true

        const schema = initialSchemaRef.current
        if (!schema || schema.nodes.length === 0) return

        // 创建 NodeView
        for (const node of schema.nodes) {
            const nodeView = new NodeView({
                schema: node,
                style: { width: 140, height: 60 },
            })
            nodeView.translate(node.x ?? 20, node.y ?? 20, 0)
            actions.view.addTempChild(nodeView)
        }

        // 创建 EdgeView
        for (const edge of schema.edges) {
            const portIds = resolveEdgePorts(edge, schema.nodes)
            if (!portIds) continue
            const edgeView = new EdgeView({
                id: edge.id,
                fromPortId: portIds.fromPortId,
                toPortId: portIds.toPortId,
            })
            actions.view.addTempChild(edgeView)
        }

        actions.app.notify()
    }, [actions])

    // ── getSchema：按需获取当前画布快照 ──
    const getSchema = useCallback((): FlowSchema => {
        if (!actions) return { nodes: [], edges: [] }
        const children = actions.page.getTopLevelViews()
        if (children.length === 0) return { nodes: [], edges: [] }
        return extractSchema(children)
    }, [actions])

    // ── 选中节点的 FlowNode schema ──
    const selectedNode = useMemo((): FlowNode | null => {
        if (!actions || !selectedViewId) return null
        const view = actions.view.getViewInstance(selectedViewId)
        if (view instanceof NodeView) return view.schema
        return null
    }, [actions, selectedViewId])

    // ── 右键菜单 ──
    const { contextMenuState, handleContextMenu } = useFlowContextMenu(actions)

    // ── 统一交互 Hook（Flow 模式） ──
    useInteraction({
        canvas,
        actions,
        mode: 'flow',
        onFlowContextMenu: handleContextMenu,
    })

    return {
        Canvas: elements.container,
        getSchema,
        selectedViewId,
        selectedViewPos,
        selectedNode,
        contextMenuState,
    }
}

// ── 内部辅助 ──

function resolveEdgePorts(
    edge: { from: string; to: string; branch?: 'true' | 'false' | 'error' },
    nodes: FlowNode[],
): { fromPortId: string; toPortId: string } | null {
    const fromNode = nodes.find(n => n.id === edge.from)
    const toNode = nodes.find(n => n.id === edge.to)
    if (!fromNode || !toNode) return null

    let fromPortId: string
    if (edge.branch === 'true') {
        fromPortId = `${edge.from}_true`
    } else if (edge.branch === 'false') {
        fromPortId = `${edge.from}_false`
    } else if (edge.branch === 'error') {
        fromPortId = `${edge.from}_error`
    } else {
        fromPortId = `${edge.from}_out`
    }

    const toPortId = `${edge.to}_in`
    return { fromPortId, toPortId }
}
