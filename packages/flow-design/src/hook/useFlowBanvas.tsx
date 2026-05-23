import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
} from 'react'
import { App } from '@banyuan/banvasgl'
import { useCanvasInit, useCanvasZoom } from '@banyuan/banvas-runtime-web'
import type { SerializedPageJSON } from '@banyuan/banvas-runtime-web'
import type { FlowSchema, FlowNode } from '@banyuan/flow'
import { useFlowCanvasEvents } from './useFlowCanvasEvents.js'
import type { FlowContextMenuEvent } from './useFlowCanvasEvents.js'
import { extractSchema } from '../extractSchema.js'
import { CLIENT_FLOW_MATERIALS, SERVER_FLOW_MATERIALS } from '../materials.js'
import type { FlowNodeMaterial } from '../materials.js'
import NodeView from '../views/NodeView.js'
import EdgeView from '../views/EdgeView.js'
import { createFlowMaterialPalette } from '../components/FlowMaterialPalette.js'
import type { FlowMaterialPaletteProps } from '../components/FlowMaterialPalette.js'
import type { FlowContextMenuState, FlowContextMenuItem } from '../components/FlowContextMenu.js'

// ── 拖拽协议 ──

/** FlowNodePalette 拖出节点时使用的 dataTransfer type */
export const FLOW_NODE_DRAG_TYPE = 'application/x-flow-node-kind'

// ── 拖拽 props 类型 ──

export interface IFlowDragProps {
    draggable: true
    onDragStart: (e: any) => void
}

// ── 公共配置类型 ──

export interface UseFlowBanvasOptions {
    width: number
    height: number
    backgroundColor?: string
}

/** 流程画布模式：client 前端事件流程 / server 云函数流程 */
export type FlowMode = 'client' | 'server'

export interface SelectedNodePos {
    /** 节点左上角在画布物理像素坐标系中的 x */
    x: number
    /** 节点左上角在画布物理像素坐标系中的 y */
    y: number
    /** 节点宽度（物理像素） */
    width: number
    /** 节点高度（物理像素） */
    height: number
}

export interface UseFlowBanvasResult {
    /** 渲染好的 Canvas React 元素 */
    Canvas: React.ReactElement
    /** App 实例引用 */
    app: App | null
    /** canvas DOM 引用（用于 getBoundingClientRect 等） */
    canvasRef: React.RefObject<HTMLCanvasElement | null>
    /**
     * 当前画布对应的完整 FlowSchema（version 驱动的派生值）
     *
     * 每次画布变化时自动重新计算，消费方直接读取即可。
     */
    schema: FlowSchema
    /**
     * 当前选中的节点 ID（null 表示无选中）
     */
    selectedNodeId: string | null
    /**
     * 当前选中节点在画布物理像素坐标系中的位置（null 表示无选中或选中非节点）
     *
     * 消费方可用于定位 Popover / 属性面板浮层。
     */
    selectedNodePos: SelectedNodePos | null
    /**
     * 当前选中节点的完整 FlowNode schema（null 表示无选中）
     */
    selectedNode: FlowNode | null
    /**
     * 当前模式对应的物料列表
     *
     * 业务方用来渲染物料面板 UI，每个物料包含 kind / label / description / category。
     */
    materials: FlowNodeMaterial[]
    /**
     * 默认物料面板组件（已绑定 materials + dragProps）
     *
     * 提供开箱即用的按 category 分组 UI，支持 renderMaterial slot 自定义：
     * ```tsx
     * <MaterialPalette />
     * // 或自定义渲染：
     * <MaterialPalette renderMaterial={(m, dp) => <MyCard {...dp}>{m.label}</MyCard>} />
     * ```
     */
    MaterialPalette: React.FC<FlowMaterialPaletteProps>
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
 * 与 useDesignBanvas 保持一致的 version 驱动模式：
 * - Scene 是 source of truth（NodeView.schema 存完整业务数据）
 * - version 变化触发重渲染，schema 自动派生
 * - initialSchema 在首次初始化时加载到 Scene
 * - 拖拽创建节点由 hook 内部完成（监听 FLOW_NODE_DRAG_TYPE）
 * - 返回 materials + dragProps，业务方自主渲染物料面板
 *
 * @param options 画布配置
 * @param initialSchema 初始加载的 FlowSchema（组件挂载时一次性加载）
 * @param mode 'client'（默认，前端事件流程）或 'server'（云函数流程）
 */
export default function useFlowBanvas(
    options: UseFlowBanvasOptions,
    initialSchema?: FlowSchema,
    mode: FlowMode = 'client',
): UseFlowBanvasResult {
    const { width, height, backgroundColor } = options

    // ── 容器尺寸自测量 ──
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

    // ── Canvas 缩放（Cmd/Ctrl + Wheel） ──
    // 只要测量到容器尺寸就启用缩放
    const zoomEnabled = containerSize.width > 0 && containerSize.height > 0
    const { styleWidth, styleHeight, zoomContainerRef } = useCanvasZoom({
        canvasWidth: width,
        canvasHeight: height,
        containerWidth: zoomEnabled ? containerSize.width : width,
        containerHeight: zoomEnabled ? containerSize.height : height,
    })

    // 空序列化页面（流程图不需要预加载页面）
    const serializedPages = useMemo<SerializedPageJSON[]>(() => [], [])

    const { app, canvasRef, canvasCallbackRef } = useCanvasInit(serializedPages, {
        width,
        height,
        rendererOptions: backgroundColor
            ? { backgroundColor, clearColor: backgroundColor }
            : undefined,
    })

    // ── 初始化加载 ──
    const initializedRef = useRef(false)
    const initialSchemaRef = useRef(initialSchema)
    initialSchemaRef.current = initialSchema

    useEffect(() => {
        if (!app || initializedRef.current) return
        initializedRef.current = true

        const schema = initialSchemaRef.current
        if (!schema || schema.nodes.length === 0) return

        const scene = app.getCurrentScene()
        if (!scene) return

        // 创建 NodeView
        for (const node of schema.nodes) {
            const nodeView = new NodeView({
                schema: node,
                style: { width: 140, height: 60 },
            })
            nodeView.translate(node.x ?? 20, node.y ?? 20, 0)
            scene.addChild(nodeView, false)
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
            scene.addChild(edgeView, false)
        }

        app.notify()
    }, [app])

    // ── version 订阅驱动重渲染 ──
    const subscribe = useCallback(
        (onStoreChange: () => void) => {
            if (!app) return () => {}
            return app.subscribe(onStoreChange)
        },
        [app],
    )

    const getSnapshot = useCallback(() => {
        if (!app) return 0
        return app.getVersion()
    }, [app])

    const _version = useSyncExternalStore(subscribe, getSnapshot)

    // ── schema 派生值（version 变化时自动重新计算） ──
    const schema = useMemo((): FlowSchema => {
        if (!app) return { nodes: [], edges: [] }
        const scene = app.getCurrentScene()
        if (!scene) return { nodes: [], edges: [] }
        return extractSchema(scene)
    }, [app, _version])

    // ── 选中节点 ID + schema + 位置（version 驱动） ──
    const selectedNodeId = useMemo((): string | null => {
        if (!app) return null
        const scene = app.getCurrentScene()
        if (!scene) return null
        const selected = scene.getSelectedView()
        if (selected instanceof NodeView) return selected.id
        return null
    }, [app, _version])

    const selectedNode = useMemo((): FlowNode | null => {
        if (!app) return null
        const scene = app.getCurrentScene()
        if (!scene) return null
        const selected = scene.getSelectedView()
        if (selected instanceof NodeView) return selected.schema
        return null
    }, [app, _version])

    const selectedNodePos = useMemo((): SelectedNodePos | null => {
        if (!app) return null
        const scene = app.getCurrentScene()
        if (!scene) return null
        const selected = scene.getSelectedView()
        if (!(selected instanceof NodeView)) return null
        // matrix 的平移分量存在 (0,3) (1,3)
        const tx = selected.matrix.get(0, 3)
        const ty = selected.matrix.get(1, 3)
        const w  = (selected.style?.width  as number | undefined) ?? 160
        const h  = (selected.style?.height as number | undefined) ?? 80
        return { x: tx, y: ty, width: w, height: h }
    }, [app, _version])

    // ── 右键菜单状态 ──
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

    /** 根据右键目标生成菜单项 */
    const handleContextMenu = useCallback((event: FlowContextMenuEvent) => {
        if (!app) return
        const scene = app.getCurrentScene()
        if (!scene) return

        const items: FlowContextMenuItem[] = []

        if (event.targetType === 'node') {
            items.push({
                key: 'delete-node',
                label: '删除节点',
                shortcut: 'Delete',
                handler: () => {
                    if (!event.targetId) return
                    const nodeView = scene.children.find(
                        v => v instanceof NodeView && v.id === event.targetId
                    )
                    if (!nodeView) return
                    // 删除关联连线
                    const relatedEdges = scene.children.filter(
                        v => v instanceof EdgeView &&
                            (v.fromPortId?.startsWith(event.targetId + '_') ||
                             v.toPortId?.startsWith(event.targetId + '_'))
                    )
                    for (const edge of relatedEdges) {
                        scene.removeChild(edge, false)
                    }
                    scene.removeChild(nodeView, false)
                    app.notify()
                },
            })
            items.push({
                key: 'duplicate-node',
                label: '复制节点',
                handler: () => {
                    if (!event.targetId) return
                    const nodeView = scene.children.find(
                        v => v instanceof NodeView && v.id === event.targetId
                    ) as NodeView | undefined
                    if (!nodeView) return
                    // 复制节点：生成新 id，偏移 20px
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
                    scene.addChild(clonedView, false)
                    app.notify()
                },
            })
            items.push({
                key: 'select-all',
                label: '全选',
                divider: true,
                handler: () => {
                    for (const v of scene.children) {
                        if (v instanceof NodeView || v instanceof EdgeView) {
                            v.actived = true
                        }
                    }
                    app.notify()
                },
            })
        } else if (event.targetType === 'edge') {
            items.push({
                key: 'delete-edge',
                label: '删除连线',
                shortcut: 'Delete',
                handler: () => {
                    const edgeView = scene.children.find(
                        v => v instanceof EdgeView && v.id === event.targetId
                    )
                    if (edgeView) {
                        scene.removeChild(edgeView, false)
                        app.notify()
                    }
                },
            })
        } else {
            // 画布空白处
            items.push({
                key: 'select-all',
                label: '全选',
                handler: () => {
                    for (const v of scene.children) {
                        if (v instanceof NodeView || v instanceof EdgeView) {
                            v.actived = true
                        }
                    }
                    app.notify()
                },
            })
            items.push({
                key: 'clear-canvas',
                label: '清空画布',
                divider: true,
                handler: () => {
                    const toRemove = [...scene.children]
                    for (const v of toRemove) {
                        scene.removeChild(v, false)
                    }
                    app.notify()
                },
            })
        }

        setContextMenuState({
            visible: true,
            position: event.position,
            targetType: event.targetType,
            targetId: event.targetId,
            items,
            dismiss: dismissMenu,
        })
    }, [app, dismissMenu])

    // ── 流程图画布事件（MOVE / CONNECT / click 选中 / 右键菜单 / Drop 创建节点） ──
    useFlowCanvasEvents({
        app,
        canvasRef,
        onInteractionEnd: () => app?.notify(),
        onContextMenu: handleContextMenu,
        dragType: FLOW_NODE_DRAG_TYPE,
    })

    // ── 物料列表 ──
    const materials = useMemo(
        () => mode === 'server' ? SERVER_FLOW_MATERIALS : CLIENT_FLOW_MATERIALS,
        [mode],
    )

    // ── 拖拽 props 工厂 ──
    const dragPropsFn = useCallback(
        (material: FlowNodeMaterial): IFlowDragProps => ({
            draggable: true,
            onDragStart: (e: any) => {
                e.dataTransfer.setData(FLOW_NODE_DRAG_TYPE, material.kind)
                e.dataTransfer.effectAllowed = 'copy'
            },
        }),
        [],
    )

    // ── 容器 callback ref：挂载时测量 + ResizeObserver 持续监听 ──
    const roRef = useRef<ResizeObserver | null>(null)
    const mergedContainerRef = useCallback(
        (node: HTMLDivElement | null) => {
            // 清理旧 observer
            if (roRef.current) {
                roRef.current.disconnect()
                roRef.current = null
            }

            zoomContainerRef(node)

            if (!node) return

            // 立即测量一次
            const { width: w, height: h } = node.getBoundingClientRect()
            if (w > 0 && h > 0) {
                setContainerSize({ width: Math.floor(w), height: Math.floor(h) })
            }

            // 持续监听
            const ro = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    const rect = entry.contentRect
                    if (rect.width > 0 && rect.height > 0) {
                        setContainerSize({ width: Math.floor(rect.width), height: Math.floor(rect.height) })
                    }
                }
            })
            ro.observe(node)
            roRef.current = ro
        },
        [zoomContainerRef],
    )

    const canvasStyle: React.CSSProperties = useMemo(
        () => zoomEnabled
            ? { display: 'block', width: styleWidth, height: styleHeight }
            : { display: 'block' },
        [zoomEnabled, styleWidth, styleHeight],
    )

    // 组件卸载时清理 observer
    useEffect(() => {
        return () => {
            if (roRef.current) {
                roRef.current.disconnect()
                roRef.current = null
            }
        }
    }, [])

    const canvasEl = useMemo(
        () => (
            <div
                ref={mergedContainerRef}
                style={{
                    position: 'relative',
                    overflow: 'auto',
                    width: '100%',
                    height: '100%',
                    flex: 1,
                    minHeight: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <canvas
                    ref={canvasCallbackRef}
                    style={canvasStyle}
                />
            </div>
        ),
        [mergedContainerRef, canvasCallbackRef, canvasStyle],
    )

    // ── 默认物料面板组件 ──
    const MaterialPalette = useMemo(
        () => createFlowMaterialPalette(materials, dragPropsFn),
        [materials, dragPropsFn],
    )

    return {
        Canvas: canvasEl,
        app,
        canvasRef,
        schema,
        selectedNodeId,
        selectedNode,
        selectedNodePos,
        materials,
        MaterialPalette,
        contextMenuState,
    }
}

// ── 内部辅助 ──

function resolveEdgePorts(
    edge: { from: string; to: string; branch?: 'true' | 'false' },
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
    } else {
        fromPortId = `${edge.from}_out`
    }

    const toPortId = `${edge.to}_in`
    return { fromPortId, toPortId }
}

