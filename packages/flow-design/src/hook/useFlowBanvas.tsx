import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useSyncExternalStore,
} from 'react'
import { App } from '@banyuan/banvasgl'
import { useCanvasInit } from '@banyuan/banvas-runtime'
import type { SerializedPageJSON } from '@banyuan/banvas-runtime'
import type { FlowSchema, FlowNode } from '@banyuan/flow'
import { useFlowCanvasEvents } from './useFlowCanvasEvents.js'
import { extractSchema } from '../extractSchema.js'
import { CLIENT_FLOW_MATERIALS, SERVER_FLOW_MATERIALS } from '../materials.js'
import type { FlowNodeMaterial } from '../materials.js'
import NodeView from '../views/NodeView.js'
import EdgeView from '../views/EdgeView.js'
import { createFlowMaterialPalette } from '../components/FlowMaterialPalette.js'
import type { FlowMaterialPaletteProps } from '../components/FlowMaterialPalette.js'

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

export interface UseFlowBanvasResult {
    /** 渲染好的 Canvas React 元素 */
    Canvas: React.ReactElement
    /** App 实例引用 */
    app: App | null
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

    // ── 选中节点 ID（version 驱动） ──
    const selectedNodeId = useMemo((): string | null => {
        if (!app) return null
        const scene = app.getCurrentScene()
        if (!scene) return null
        const selected = scene.getSelectedView()
        if (selected instanceof NodeView) return selected.id
        return null
    }, [app, _version])

    // ── 流程图画布事件（MOVE / CONNECT / click 选中） ──
    useFlowCanvasEvents({
        app,
        canvasRef,
        onInteractionEnd: () => app?.notify(),
    })

    // ── Drop 事件绑定（内部处理拖拽创建节点） ──
    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas || !app) return

        const handleDragOver = (e: DragEvent) => {
            e.preventDefault()
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
        }

        const handleDrop = (e: DragEvent) => {
            e.preventDefault()

            const kind = e.dataTransfer?.getData(FLOW_NODE_DRAG_TYPE)
            if (!kind) return

            const newNode = buildDefaultNode(kind as FlowNode['kind'])
            if (!newNode) return

            const scene = app.getCurrentScene()
            if (!scene) return

            // 计算画布内坐标
            const dpr = window.devicePixelRatio || 1
            const rect = canvas.getBoundingClientRect()
            const x = (e.clientX - rect.left) * dpr
            const y = (e.clientY - rect.top) * dpr

            // 创建 NodeView 并添加到场景
            const nodeView = new NodeView({
                schema: newNode,
                style: { width: 140, height: 60 },
            })
            nodeView.translate(x, y, 0)
            scene.addChild(nodeView, false)

            app.notify()
        }

        canvas.addEventListener('dragover', handleDragOver)
        canvas.addEventListener('drop', handleDrop)
        return () => {
            canvas.removeEventListener('dragover', handleDragOver)
            canvas.removeEventListener('drop', handleDrop)
        }
    }, [app, canvasRef])

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

    const canvasEl = useMemo(
        () => (
            <canvas
                ref={canvasCallbackRef}
                style={{ display: 'block' }}
            />
        ),
        [canvasCallbackRef],
    )

    // ── 默认物料面板组件 ──
    const MaterialPalette = useMemo(
        () => createFlowMaterialPalette(materials, dragPropsFn),
        [materials, dragPropsFn],
    )

    return {
        Canvas: canvasEl,
        app,
        schema,
        selectedNodeId,
        materials,
        MaterialPalette,
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

/** 生成简单唯一 id */
function genId(): string {
    return `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

/**
 * 根据 kind 构建带默认参数的 FlowNode
 */
function buildDefaultNode(kind: FlowNode['kind']): FlowNode | null {
    const id = genId()
    const base = { id, x: 0, y: 0 }

    switch (kind) {
        case 'setData':
            return { ...base, kind: 'setData', viewId: 'self', key: '', value: { kind: 'literal', value: '' } }
        case 'setVisible':
            return { ...base, kind: 'setVisible', viewId: 'self', visible: true }
        case 'navigate':
            return { ...base, kind: 'navigate', pageId: '' }
        case 'animate':
            return { ...base, kind: 'animate', viewId: 'self', animationId: '' }
        case 'dbQuery':
            return { ...base, kind: 'dbQuery', collection: '', filter: {}, outputVariable: 'queryResult' }
        case 'dbInsert':
            return { ...base, kind: 'dbInsert', collection: '', document: {}, outputVariable: 'insertedId' }
        case 'dbUpdate':
            return { ...base, kind: 'dbUpdate', collection: '', filter: {}, update: {}, outputVariable: 'modifiedCount' }
        case 'dbDelete':
            return { ...base, kind: 'dbDelete', collection: '', filter: {}, outputVariable: 'deletedCount' }
        case 'httpRequest':
            return { ...base, kind: 'httpRequest', url: { kind: 'literal', value: '' }, method: 'GET', outputVariable: 'response' }
        case 'transform':
            return { ...base, kind: 'transform', expression: '', variables: {}, outputVariable: 'result' }
        case 'script':
            return { ...base, kind: 'script', code: '', inputBindings: {}, outputBindings: {} }
        case 'condition':
            return {
                ...base,
                kind: 'condition',
                condition: {
                    left:  { kind: 'literal', value: '' },
                    op:    '==',
                    right: { kind: 'literal', value: '' },
                },
            }
        case 'delay':
            return { ...base, kind: 'delay', ms: 500 }
        case 'variable':
            return { ...base, kind: 'variable', viewId: 'self', key: '' }
        case 'pageVar':
            return { ...base, kind: 'pageVar', key: '' }
        case 'eventParam':
            return { ...base, kind: 'eventParam', index: 0 }
        case 'setVariable':
            return { ...base, kind: 'setVariable', scope: 'local', key: '', value: { kind: 'literal', value: '' } }
        case 'callFlow':
            return { ...base, kind: 'callFlow', flowId: '', inputBindings: {}, outputBindings: {} }
        default:
            return null
    }
}
