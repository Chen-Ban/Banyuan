import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { useFlowBanvas, NodeView, EdgeView } from 'banvasgl'
import type { FlowSchema, FlowNode, FlowEdge, PortDirection } from 'banvasgl'
import { getFlowNodeDragData } from './FlowNodePalette'
import FlowNodePalette from './FlowNodePalette'
import styles from './index.module.scss'

interface FlowCanvasProps {
    /** 当前绑定的 FlowSchema（null 表示尚未绑定） */
    schema: FlowSchema | null
    /** schema 变更回调 */
    onChange: (schema: FlowSchema) => void
}

const CANVAS_WIDTH = 168
const CANVAS_HEIGHT = 300

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
        case 'setData': return '设置数据'
        case 'setVisible': return '显隐控制'
        case 'navigate': return '跳转页面'
        case 'animate': return '播放动画'
        case 'condition': return '条件分支'
        case 'delay': return '延迟等待'
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
        case 'setData':
            return { ...base, kind: 'setData', viewId: 'self', key: '', value: { kind: 'literal', value: '' } }
        case 'setVisible':
            return { ...base, kind: 'setVisible', viewId: 'self', visible: true }
        case 'navigate':
            return { ...base, kind: 'navigate', pageId: '' }
        case 'animate':
            return { ...base, kind: 'animate', viewId: 'self', animationId: '' }
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
    }
}

/**
 * 函数编辑画布
 *
 * 左侧是 BanvasGL 流程图画布，右侧是事件节点物料面板。
 * 物料面板中的节点可拖拽到画布上，drop 时在对应位置创建新节点并写回 FlowSchema。
 */
const FlowCanvas: React.FC<FlowCanvasProps> = ({ schema, onChange }) => {
    const canvasWrapperRef = useRef<HTMLDivElement>(null)

    const serializedPages = useMemo<string[]>(() => [], [])

    const { Canvas, app } = useFlowBanvas(
        serializedPages,
        {
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT,
            backgroundColor: 'transparent',
        },
    )

    // ── 同步 schema → 引擎 Scene（schema 变化时重建节点和连线） ──
    useEffect(() => {
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

        // 计算 drop 点相对于画布容器的坐标
        const rect = canvasWrapperRef.current?.getBoundingClientRect()
        const x = rect ? e.clientX - rect.left : 0
        const y = rect ? e.clientY - rect.top  : 0

        const newNode = buildDefaultNode(kind, x, y)

        // 将新节点追加到当前 schema
        const current = schema ?? { nodes: [], edges: [] }
        onChange({
            nodes: [...current.nodes, newNode],
            edges: current.edges,
        })
    }, [schema, onChange])

    return (
        <div className={styles.flowCanvasLayout}>
            {/* 左侧：流程图画布 */}
            <div
                ref={canvasWrapperRef}
                className={styles.flowCanvasWrapper}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
            >
                {Canvas}
            </div>

            {/* 右侧：事件节点物料面板 */}
            <FlowNodePalette />
        </div>
    )
}

export default FlowCanvas
