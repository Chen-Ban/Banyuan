import React, { useCallback, useMemo, useRef } from 'react'
import { useFlowBanvas } from 'banvasgl'
import type { FlowSchema, FlowNode } from 'banvasgl'
import { getFlowNodeDragData } from './FlowNodePalette'
import FlowNodePalette from './FlowNodePalette'
import styles from './index.module.scss'

interface FlowCanvasProps {
    /** 当前绑定的 FlowSchema（null 表示尚未绑定） */
    schema: FlowSchema | null
    /** schema 变更回调 */
    onChange: (schema: FlowSchema) => void
}

const CANVAS_WIDTH = 236
const CANVAS_HEIGHT = 300

/** 生成简单唯一 id */
function genId(): string {
    return `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
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

    const serializedScenes = useMemo<string[]>(() => [], [])

    const handleSchemaChange = useCallback(() => {
        // TODO: 从 app.getCurrentScene() 读取 NodeView/EdgeView 并序列化为 FlowSchema
        onChange({ nodes: [], edges: [] })
    }, [onChange])

    const { Canvas } = useFlowBanvas(
        serializedScenes,
        {
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT,
            backgroundColor: '#f8f9fa',
        },
        handleSchemaChange,
    )

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
