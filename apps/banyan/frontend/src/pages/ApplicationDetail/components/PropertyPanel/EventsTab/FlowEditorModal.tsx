import React from 'react'
import { Modal } from 'antd'
import type { FlowSchema } from '@banyuan/sdk/core'
import FlowNodePalette from './FlowNodePalette'
import FlowCanvas from './FlowCanvas'
import styles from './FlowEditorModal.module.scss'

interface FlowEditorModalProps {
    open: boolean
    title: string
    schema: FlowSchema | null
    onChange: (schema: FlowSchema) => void
    onClose: () => void
}

const FlowEditorModal: React.FC<FlowEditorModalProps> = ({
    open,
    title,
    schema,
    onChange,
    onClose,
}) => {
    return (
        <Modal
            open={open}
            title={title}
            onCancel={onClose}
            footer={null}
            width={720}
            styles={{ body: { padding: 0 } }}
            destroyOnHidden
        >
            <div className={styles.modalBody}>
                {/* 上方：节点物料面板 */}
                <div className={styles.paletteArea}>
                    <FlowNodePalette layout="horizontal" />
                </div>
                {/* 中间：流程画布 */}
                <div className={styles.canvasArea}>
                    <FlowCanvas
                        schema={schema}
                        onChange={onChange}
                    />
                </div>
            </div>
        </Modal>
    )
}

export default FlowEditorModal
