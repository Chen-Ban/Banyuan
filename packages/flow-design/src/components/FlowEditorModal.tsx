import React, { useCallback, useRef, useState } from 'react'
import { Modal } from 'antd'
import type { FlowSchema } from '@banyuan/flow'
import useFlowBanvas from '../hook/useFlowBanvas.js'
import { FlowContextMenu } from './FlowContextMenu.js'
import { NodeSchemaPopover } from './NodeSchemaPopover.js'

// ── 内联样式（避免外部 CSS 依赖，保持引擎包自包含） ──

const modalBodyStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: 560,
}

const paletteAreaStyle: React.CSSProperties = {
    flexShrink: 0,
    borderBottom: '1px solid #e9ecef',
    background: '#f8f9fa',
    padding: '8px 12px',
}

const canvasAreaStyle: React.CSSProperties = {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    background: '#fff',
    position: 'relative',
}

// ── 组件 ──

export interface FlowEditorModalProps {
    open: boolean
    title: string
    /** 初始 schema（弹窗 destroyOnHidden，每次打开重新挂载） */
    initialSchema: FlowSchema
    /** 关闭时回传当前画布 schema */
    onSave: (schema: FlowSchema) => void
    onClose: () => void
}

const CANVAS_WIDTH = 680
const CANVAS_HEIGHT = 400

/**
 * 流程编辑弹窗
 *
 * 直接使用 useFlowBanvas hook，不额外封装组件。
 * hook 返回 Canvas + MaterialPalette（默认物料面板 UI）。
 *
 * 点击节点后在画布右侧显示 NodeSchemaPopover 浮层，
 * 展示节点属性摘要（后续可扩展为完整编辑表单）。
 */
export const FlowEditorModal: React.FC<FlowEditorModalProps> = ({
    open,
    title,
    initialSchema,
    onSave,
    onClose,
}) => {
    const {
        Canvas,
        schema,
        canvasRef,
        selectedNode,
        selectedNodePos,
        MaterialPalette,
        contextMenuState,
    } = useFlowBanvas(
        { width: CANVAS_WIDTH, height: CANVAS_HEIGHT, backgroundColor: 'transparent' },
        initialSchema,
        'client',
    )

    // ── Popover 开关：点击节点打开，关闭 or 点击空白关闭 ──
    const [popoverOpen, setPopoverOpen] = useState(false)
    const prevSelectedNodeIdRef = useRef<string | null>(null)
    const currentNodeId = selectedNode?.id ?? null

    // 当选中节点变化时，若有新选中节点则打开 popover
    if (currentNodeId !== prevSelectedNodeIdRef.current) {
        prevSelectedNodeIdRef.current = currentNodeId
        if (currentNodeId !== null && !popoverOpen) {
            // 用异步避免在 render 中直接 setState
            Promise.resolve().then(() => setPopoverOpen(true))
        } else if (currentNodeId === null) {
            // 选中清除 → 关闭 popover
            Promise.resolve().then(() => setPopoverOpen(false))
        }
    }

    const handleClosePopover = useCallback(() => setPopoverOpen(false), [])

    // canvas 的 DOMRect（在 Popover 需要时才获取，避免不必要的 reflow）
    const canvasRect = canvasRef.current ? canvasRef.current.getBoundingClientRect() : null

    const handleOk = useCallback(() => {
        onSave(schema)
        onClose()
    }, [schema, onSave, onClose])

    const handleCancel = useCallback(() => {
        // 取消时也保存当前状态
        onSave(schema)
        onClose()
    }, [schema, onSave, onClose])

    return (
        <Modal
            open={open}
            title={title}
            onOk={handleOk}
            onCancel={handleCancel}
            okText="保存"
            cancelText="取消"
            width={720}
            styles={{ body: { padding: 0 } }}
            destroyOnHidden
        >
            <div style={modalBodyStyle}>
                {/* 上方：节点物料面板（使用 hook 提供的默认 UI） */}
                <div style={paletteAreaStyle}>
                    <MaterialPalette />
                </div>
                {/* 中间：流程画布 */}
                <div style={canvasAreaStyle}>
                    {Canvas}
                </div>
            </div>

            {/* 右键菜单 */}
            <FlowContextMenu state={contextMenuState} />

            {/* 节点属性浮层 */}
            {popoverOpen && selectedNode && selectedNodePos && (
                <NodeSchemaPopover
                    node={selectedNode}
                    nodePos={selectedNodePos}
                    canvasRect={canvasRect}
                    onClose={handleClosePopover}
                />
            )}
        </Modal>
    )
}

export default FlowEditorModal
