import React, { useCallback, useRef, useState } from 'react'
import { Modal } from 'antd'
import type { FlowSchema } from '@banyuan/flow'
import useFlowBanvas from '../../../hooks/flow/useFlowBanvas'
import { FlowContextMenu } from '../FlowContextMenu'
import { NodeSchemaPopover } from '../NodeSchemaPopover'
import styles from './index.module.scss'

export interface FlowEditorModalProps {
    open: boolean
    title: string
    initialSchema: FlowSchema
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

    const [popoverOpen, setPopoverOpen] = useState(false)
    const prevSelectedNodeIdRef = useRef<string | null>(null)
    const currentNodeId = selectedNode?.id ?? null

    if (currentNodeId !== prevSelectedNodeIdRef.current) {
        prevSelectedNodeIdRef.current = currentNodeId
        if (currentNodeId !== null && !popoverOpen) {
            Promise.resolve().then(() => setPopoverOpen(true))
        } else if (currentNodeId === null) {
            Promise.resolve().then(() => setPopoverOpen(false))
        }
    }

    const handleClosePopover = useCallback(() => setPopoverOpen(false), [])

    const canvasRect = canvasRef.current ? canvasRef.current.getBoundingClientRect() : null

    const handleOk = useCallback(() => {
        onSave(schema)
        onClose()
    }, [schema, onSave, onClose])

    const handleCancel = useCallback(() => {
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
            <div className={styles.modalBody}>
                <div className={styles.paletteArea}>
                    <MaterialPalette />
                </div>
                <div className={styles.canvasArea}>
                    {Canvas}
                </div>
            </div>

            <FlowContextMenu state={contextMenuState} />

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
