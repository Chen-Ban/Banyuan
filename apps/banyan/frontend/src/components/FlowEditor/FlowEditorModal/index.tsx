import React, { useCallback, useRef, useState } from 'react'
import { Modal } from 'antd'
import type { FlowSchema } from '@banyuan/banvasgl'
import useFlowBanvas from '../../../hooks/useFlowBanvas'
import { FlowContextMenu } from '../FlowContextMenu'
import { NodeSchemaPopover } from '../NodeSchemaPopover'
import FlowMaterialPalette from '../FlowMaterialPalette'
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
 * 直接使用 useFlowBanvas hook + FlowMaterialPalette 自含组件。
 * 拖拽创建节点统一走 application/json + materialId 协议，网络获取物料。
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
        getSchema,
        selectedNode,
        selectedViewPos,
        contextMenuState,
    } = useFlowBanvas(
        { width: CANVAS_WIDTH, height: CANVAS_HEIGHT, backgroundColor: 'transparent' },
        initialSchema,
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

    const handleOk = useCallback(() => {
        onSave(getSchema())
        onClose()
    }, [getSchema, onSave, onClose])

    const handleCancel = useCallback(() => {
        onSave(getSchema())
        onClose()
    }, [getSchema, onSave, onClose])

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
                    <FlowMaterialPalette mode="client" />
                </div>
                <div className={styles.canvasArea}>
                    {Canvas}
                </div>
            </div>

            <FlowContextMenu state={contextMenuState} />

{popoverOpen && selectedNode && selectedViewPos && (
<NodeSchemaPopover
node={selectedNode}
nodePos={selectedViewPos}
                    onClose={handleClosePopover}
                />
            )}
        </Modal>
    )
}

export default FlowEditorModal
