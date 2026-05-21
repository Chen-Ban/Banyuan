import React, { useCallback } from 'react'
import { Modal } from 'antd'
import type { FlowSchema } from '@banyuan/banyan-sdk'
import { useFlowBanvas } from '@banyuan/banyan-sdk'
import styles from './FlowEditorModal.module.scss'

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
 */
const FlowEditorModal: React.FC<FlowEditorModalProps> = ({
    open,
    title,
    initialSchema,
    onSave,
    onClose,
}) => {
    const { Canvas, schema, MaterialPalette } = useFlowBanvas(
        { width: CANVAS_WIDTH, height: CANVAS_HEIGHT, backgroundColor: 'transparent' },
        initialSchema,
        'client',
    )

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
            <div className={styles.modalBody}>
                {/* 上方：节点物料面板（使用 hook 提供的默认 UI） */}
                <div className={styles.paletteArea}>
                    <MaterialPalette />
                </div>
                {/* 中间：流程画布 */}
                <div className={styles.canvasArea}>
                    {Canvas}
                </div>
            </div>
        </Modal>
    )
}

export default FlowEditorModal
