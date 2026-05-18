import React, { useCallback, useState } from 'react'
import { Modal } from 'antd'
import type { FlowNode, FlowSchema } from 'banvasgl'
import FlowNodePalette from './FlowNodePalette'
import FlowCanvas from './FlowCanvas'
import {
    CloudFunctionNodeEditor,
    findCloudFunctionNode,
    updateNodeInSchema,
} from './CloudFunctionNodeEditor'
import styles from './FlowEditorModal.module.scss'

interface FlowEditorModalProps {
    open: boolean
    title: string
    schema: FlowSchema | null
    onChange: (schema: FlowSchema) => void
    onClose: () => void
    /** 应用 ID，用于云函数节点编辑器加载函数列表 */
    appId?: string
}

const FlowEditorModal: React.FC<FlowEditorModalProps> = ({
    open,
    title,
    schema,
    onChange,
    onClose,
    appId,
}) => {
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

    const handleNodeSelect = useCallback((nodeId: string | null) => {
        setSelectedNodeId(nodeId)
    }, [])

    const handleNodeUpdate = useCallback((updatedNode: FlowNode) => {
        if (!schema) return
        onChange(updateNodeInSchema(schema, updatedNode))
    }, [schema, onChange])

    const selectedCfNode = findCloudFunctionNode(schema, selectedNodeId)

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
                        onNodeSelect={handleNodeSelect}
                    />
                </div>
                {/* 下方：选中 callCloudFunction 节点时展示属性编辑器 */}
                {selectedCfNode && appId && (
                    <CloudFunctionNodeEditor
                        node={selectedCfNode}
                        appId={appId}
                        onChange={handleNodeUpdate}
                    />
                )}
            </div>
        </Modal>
    )
}

export default FlowEditorModal
