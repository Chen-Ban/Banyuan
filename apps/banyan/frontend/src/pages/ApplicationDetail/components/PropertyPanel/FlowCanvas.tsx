import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFlowBanvas, NodeView, EdgeView } from 'banvasgl'
import type { FlowSchema, FlowNode, FlowEdge, PortDirection } from 'banvasgl'
import { getFlowNodeDragData } from './FlowNodePalette'
import styles from './index.module.scss'

interface FlowCanvasProps {
    /** 当前绑定的 FlowSchema（null 表示尚未绑定） */
    schema: FlowSchema | null
    /** schema 变更回调 */
    onChange: (schema: FlowSchema) => void
    /** 节点选中回调（点击节点时触发，点击空白时传 null） */
    onNodeSelect?: (nodeId: string | null) => void
    /** 画布宽度（传入则使用，否则自适应容器） */
    width?: number
    /** 画布高度（传入则使用，否则自适应容器） */
    height?: number
}

const DEFAULT_CANVAS_WIDTH = 680
const DEFAULT_CANVAS_HEIGHT = 400

/** 生成简单唯一 id */
function genId(): string {
    return `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

// ── FlowNode → NodeView 端口定义映射 ──

interface PortDef {
    id: string
    direction: PortDirection
}

function getPortsForNode(node: FlowNode): PortDef[] {
    const ports: PortDef[] = []
    const kind = node.kind

    // 值节点：只有一个输出端口（值输出）
    if (kind === 'variable' || kind === 'pageVar' || kind === 'eventParam') {
        ports.push({ id: `${node.id}_out`, direction: 'output' })
        return ports
    }

    // 动作节点：至少有一个输入端口 + 一个输出端口
    ports.push({ id: `${node.id}_in`, direction: 'input' })

    if (kind === 'condition') {
        // 条件节点有两个输出：true 和 false
        ports.push({ id: `${node.id}_true`, direction: 'output' })
        ports.push({ id: `${node.id}_false`, direction: 'output' })
    } else {
        ports.push({ id: `${node.id}_out`, direction: 'output' })
    }

    return ports
}

/** 节点的显示标题 */
function getNodeTitle(node: FlowNode): string {
    switch (node.kind) {
        // 前端节点
        case 'setData': return '设置数据'
        case 'setVisible': return '显隐控制'
        case 'navigate': return '跳转页面'
        case 'animate': return '播放动画'
        // 后端节点
        case 'dbQuery': return '数据库查询'
        case 'dbInsert': return '数据库插入'
        case 'dbUpdate': return '数据库更新'
        case 'dbDelete': return '数据库删除'
        case 'httpRequest': return 'HTTP 请求'
        case 'transform': return '数据转换'
        case 'script': return '自定义脚本'
        // 共享节点
        case 'condition': return '条件分支'
        case 'delay': return '延迟等待'
        // 值节点
        case 'variable': return 'View 变量'
        case 'pageVar': return '页面变量'
        case 'eventParam': return '事件参数'
    }
}

/** 将 FlowEdge 转为 EdgeView 的 fromPortId/toPortId */
function resolveEdgePorts(edge: FlowEdge, nodes: FlowNode[]): { fromPortId: string; toPortId: string } | null {
    const fromNode = nodes.find(n => n.id === edge.from)
    const toNode = nodes.find(n => n.id === edge.to)
    if (!fromNode || !toNode) return null

    // 确定 from 端口
    let fromPortId: string
    if (edge.branch === 'true') {
        fromPortId = `${edge.from}_true`
    } else if (edge.branch === 'false') {
        fromPortId = `${edge.from}_false`
    } else {
        fromPortId = `${edge.from}_out`
    }

    // 确定 to 端口
    const toPortId = edge.toParam ? `${edge.to}_in` : `${edge.to}_in`

    return { fromPortId, toPortId }
}

/**
 * 根据拖入的 kind 构建一个带默认参数的 FlowNode
 */
function buildDefaultNode(
    kind: FlowNode['kind'],
    x: number,
    y: number,
): FlowNode {
    const id = genId()
    const base = { id, x, y }

    switch (kind) {
        // 前端节点
        case 'setData':
            return { ...base, kind: 'setData', viewId: 'self', key: '', value: { kind: 'literal', value: '' } }
        case 'setVisible':
            return { ...base, kind: 'setVisible', viewId: 'self', visible: true }
        case 'navigate':
            return { ...base, kind: 'navigate', pageId: '' }
        case 'animate':
            return { ...base, kind: 'animate', viewId: 'self', animationId: '' }
        // 后端节点
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
        // 共享节点
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
        // 值节点
        case 'variable':
            return { ...base, kind: 'variable', viewId: 'self', key: '' }
        case 'pageVar':
            return { ...base, kind: 'pageVar', key: '' }
        case 'eventParam':
            return { ...base, kind: 'eventParam', index: 0 }
    }
}

/**
 * 流程图画布（纯画布，不含物料面板）
 *
 * 物料面板由外层的 FlowEditorModal 负责渲染，节点通过拖拽 drop 到此画布上创建。
 */
const FlowCanvas: React.FC<FlowCanvasProps> = ({ schema, onChange, onNodeSelect, width: propWidth, height: propHeight }) => {
    const canvasWrapperRef = useRef<HTMLDivElement>(null)
    const canvasElRef = useRef<HTMLCanvasElement | null>(null)
    // 保持对最新 schema 的 ref 引用，避免 onSchemaChange 闭包捕获旧值
    const schemaRef = useRef(schema)
    schemaRef.current = schema
    const onChangeRef = useRef(onChange)
    onChangeRef.current = onChange
    // 标记：当 schema 变更由画布内交互触发时跳过 useEffect 全量重建
    const skipNextSyncRef = useRef(false)

    // 自适应容器尺寸
    const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({ w: DEFAULT_CANVAS_WIDTH, h: DEFAULT_CANVAS_HEIGHT })

    useEffect(() => {
        if (propWidth && propHeight) return // 外部传入尺寸时不需要 observe
        const el = canvasWrapperRef.current
        if (!el) return
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width: w, height: h } = entry.contentRect
                if (w > 0 && h > 0) {
                    setContainerSize({ w: Math.floor(w), h: Math.floor(h) })
                }
            }
        })
        ro.observe(el)
        return () => ro.disconnect()
    }, [propWidth, propHeight])

    const canvasWidth = propWidth ?? containerSize.w
    const canvasHeight = propHeight ?? containerSize.h

    const serializedPages = useMemo<string[]>(() => [], [])

    /**
     * 从 Scene 中提取当前所有 NodeView/EdgeView 的状态，
     * 与当前 schema 中的 FlowNode 详情合并，构建最新 FlowSchema 并回调 onChange。
     *
     * 只更新位置和连线关系，节点的业务属性（kind、参数等）保持不变。
     */
    const handleSchemaChange = useCallback(() => {
        if (!appRef.current) return
        const scene = appRef.current.getCurrentScene()
        if (!scene) return
        const currentSchema = schemaRef.current ?? { nodes: [], edges: [] }

        // 从 Scene 中提取节点最新位置
        const updatedNodes: FlowNode[] = []
        const updatedEdges: FlowEdge[] = []

        for (const child of scene.children) {
            if (child instanceof NodeView) {
                // 找到对应的 schema 节点，保留其业务属性，只更新坐标
                const existing = currentSchema.nodes.find(n => n.id === child.id)
                if (existing) {
                    updatedNodes.push({
                        ...existing,
                        x: child.matrix.get(0, 3),
                        y: child.matrix.get(1, 3),
                    })
                }
            } else if (child instanceof EdgeView) {
                if (!child.fromPortId || !child.toPortId) continue
                // 从端口 ID 反推 from/to nodeId 和 branch
                const fromNodeId = child.fromPortId.replace(/_[^_]+$/, '')
                const toNodeId = child.toPortId.replace(/_[^_]+$/, '')
                const fromSuffix = child.fromPortId.slice(fromNodeId.length + 1)

                let branch: 'true' | 'false' | undefined
                if (fromSuffix === 'true') branch = 'true'
                else if (fromSuffix === 'false') branch = 'false'

                updatedEdges.push({
                    id: child.id || `edge_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                    from: fromNodeId,
                    to: toNodeId,
                    branch,
                })
            }
        }

        // 设置标记跳过下一次 useEffect 全量重建（Scene 中状态已是最新）
        skipNextSyncRef.current = true
        onChangeRef.current({ nodes: updatedNodes, edges: updatedEdges })
    }, [])

    // app ref（handleSchemaChange 需要引用最新 app）
    const appRef = useRef<ReturnType<typeof useFlowBanvas>['app']>(null)

    const { Canvas, app } = useFlowBanvas(
        serializedPages,
        {
            width: canvasWidth,
            height: canvasHeight,
            backgroundColor: 'transparent',
        },
        handleSchemaChange,
    )
    appRef.current = app

    // 拿到 canvas 元素引用，用于 drop 坐标计算
    useEffect(() => {
        if (!canvasWrapperRef.current) return
        const canvas = canvasWrapperRef.current.querySelector('canvas')
        canvasElRef.current = canvas
    })

    // ── 同步 schema → 引擎 Scene（schema 变化时重建节点和连线） ──
    useEffect(() => {
        // 跳过画布内交互触发的 schema 变更（Scene 状态已是最新）
        if (skipNextSyncRef.current) {
            skipNextSyncRef.current = false
            return
        }

        if (!app) return
        const scene = app.getCurrentScene()
        if (!scene) return

        // 清除场景中所有子节点
        const existingChildren = [...scene.children]
        for (const child of existingChildren) {
            scene.removeChild(child, false)
        }

        if (!schema || schema.nodes.length === 0) {
            app.notify()
            return
        }

        // 创建 NodeView
        for (const node of schema.nodes) {
            const ports = getPortsForNode(node)
            const nodeView = new NodeView({
                id: node.id,
                nodeTitle: getNodeTitle(node),
                ports,
                style: {
                    width: 140,
                    height: 60,
                },
            })
            // 设置节点位置
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
    }, [app, schema])

    // ── 拖拽放置处理 ──

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
    }, [])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()

        const kind = getFlowNodeDragData(e)
        if (!kind) return

        // 用 canvas 元素本身的 bounding rect 计算坐标，避免 wrapper 内偏移
        // canvas 的逻辑尺寸 = CSS 像素，物理像素 = CSS 像素 × DPR
        // 引擎内部坐标系是物理像素，所以需要乘以 devicePixelRatio
        const canvasEl = canvasElRef.current ?? canvasWrapperRef.current?.querySelector('canvas')
        const rect = canvasEl?.getBoundingClientRect() ?? canvasWrapperRef.current?.getBoundingClientRect()
        const dpr = window.devicePixelRatio || 1
        const x = rect ? (e.clientX - rect.left) * dpr : 0
        const y = rect ? (e.clientY - rect.top) * dpr : 0

        const newNode = buildDefaultNode(kind, x, y)

        // 将新节点追加到当前 schema
        const current = schema ?? { nodes: [], edges: [] }
        onChange({
            nodes: [...current.nodes, newNode],
            edges: current.edges,
        })
    }, [schema, onChange])

    // ── 点击选中节点 ──

    const handleClick = useCallback((e: React.MouseEvent) => {
        if (!onNodeSelect || !schema) return

        const canvasEl = canvasElRef.current ?? canvasWrapperRef.current?.querySelector('canvas')
        const rect = canvasEl?.getBoundingClientRect() ?? canvasWrapperRef.current?.getBoundingClientRect()
        const dpr = window.devicePixelRatio || 1
        const x = rect ? (e.clientX - rect.left) * dpr : 0
        const y = rect ? (e.clientY - rect.top) * dpr : 0

        // 简单的矩形命中检测（节点宽 140，高 60）
        const NODE_W = 140
        const NODE_H = 60
        const hitNode = schema.nodes.find((node) => {
            const nx = node.x ?? 0
            const ny = node.y ?? 0
            return x >= nx && x <= nx + NODE_W && y >= ny && y <= ny + NODE_H
        })

        onNodeSelect(hitNode?.id ?? null)
    }, [onNodeSelect, schema])

    return (
        <div
            ref={canvasWrapperRef}
            className={styles.flowCanvasWrapper}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={handleClick}
        >
            {Canvas}
        </div>
    )
}

export default FlowCanvas
