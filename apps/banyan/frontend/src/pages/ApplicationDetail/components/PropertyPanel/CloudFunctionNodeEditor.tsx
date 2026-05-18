import React, { useCallback, useEffect, useState } from 'react'
import { Button, Input, Select } from 'antd'
import type { FlowNode, FlowSchema, FlowValue } from 'banvasgl'
import { functionsApi } from '@/api'
import type { AppFunction } from '@/api'
import styles from './CloudFunctionNodeEditor.module.scss'

interface CloudFunctionNodeEditorProps {
    /** 当前选中的 callCloudFunction 节点 */
    node: FlowNode & { kind: 'callCloudFunction' }
    /** 当前应用 ID */
    appId: string
    /** 节点数据变更回调 */
    onChange: (updatedNode: FlowNode) => void
}

/**
 * callCloudFunction 节点属性面板
 *
 * 选中该节点时展示：
 * - 云函数下拉选择（从当前应用的函数列表中选）
 * - 输入参数映射配置
 * - 输出参数映射配置
 */
const CloudFunctionNodeEditor: React.FC<CloudFunctionNodeEditorProps> = ({
    node,
    appId,
    onChange,
}) => {
    const [functions, setFunctions] = useState<AppFunction[]>([])
    const [loading, setLoading] = useState(false)

    // 加载函数列表
    useEffect(() => {
        if (!appId) return
        setLoading(true)
        functionsApi.listFunctions(appId)
            .then((res) => setFunctions(res.data ?? []))
            .catch(() => { /* 静默 */ })
            .finally(() => setLoading(false))
    }, [appId])

    const handleFunctionChange = useCallback((functionName: string) => {
        onChange({ ...node, functionName })
    }, [node, onChange])

    // ── 输入绑定管理 ──

    const handleAddInputBinding = useCallback(() => {
        const existingKeys = Object.keys(node.inputBindings)
        let n = existingKeys.length + 1
        let newKey = `param${n}`
        while (existingKeys.includes(newKey)) newKey = `param${++n}`
        const newBindings = { ...node.inputBindings, [newKey]: { kind: 'literal' as const, value: '' } }
        onChange({ ...node, inputBindings: newBindings })
    }, [node, onChange])

    const handleInputKeyChange = useCallback((oldKey: string, newKey: string) => {
        if (oldKey === newKey || !newKey.trim()) return
        const entries = Object.entries(node.inputBindings)
        const newBindings: Record<string, FlowValue> = {}
        for (const [k, v] of entries) {
            newBindings[k === oldKey ? newKey : k] = v
        }
        onChange({ ...node, inputBindings: newBindings })
    }, [node, onChange])

    const handleInputValueChange = useCallback((key: string, value: string) => {
        const newBindings = {
            ...node.inputBindings,
            [key]: { kind: 'literal' as const, value },
        }
        onChange({ ...node, inputBindings: newBindings })
    }, [node, onChange])

    const handleRemoveInputBinding = useCallback((key: string) => {
        const newBindings = { ...node.inputBindings }
        delete newBindings[key]
        onChange({ ...node, inputBindings: newBindings })
    }, [node, onChange])

    // ── 输出绑定管理 ──

    const handleAddOutputBinding = useCallback(() => {
        const existingKeys = Object.keys(node.outputBindings)
        let n = existingKeys.length + 1
        let newKey = `result${n}`
        while (existingKeys.includes(newKey)) newKey = `result${++n}`
        const newBindings = { ...node.outputBindings, [newKey]: '' }
        onChange({ ...node, outputBindings: newBindings })
    }, [node, onChange])

    const handleOutputKeyChange = useCallback((oldKey: string, newKey: string) => {
        if (oldKey === newKey || !newKey.trim()) return
        const entries = Object.entries(node.outputBindings)
        const newBindings: Record<string, string> = {}
        for (const [k, v] of entries) {
            newBindings[k === oldKey ? newKey : k] = v
        }
        onChange({ ...node, outputBindings: newBindings })
    }, [node, onChange])

    const handleOutputValueChange = useCallback((key: string, pageVarKey: string) => {
        const newBindings = { ...node.outputBindings, [key]: pageVarKey }
        onChange({ ...node, outputBindings: newBindings })
    }, [node, onChange])

    const handleRemoveOutputBinding = useCallback((key: string) => {
        const newBindings = { ...node.outputBindings }
        delete newBindings[key]
        onChange({ ...node, outputBindings: newBindings })
    }, [node, onChange])

    return (
        <div className={styles.editor}>
            <div className={styles.editorTitle}>云函数节点配置</div>

            {/* 函数选择 */}
            <div className={styles.field}>
                <span className={styles.fieldLabel}>选择云函数</span>
                <Select
                    size="small"
                    value={node.functionName || undefined}
                    placeholder="选择要调用的云函数..."
                    loading={loading}
                    options={functions.map((fn) => ({
                        value: fn.name,
                        label: `${fn.name}${fn.description ? ` — ${fn.description}` : ''}`,
                    }))}
                    onChange={handleFunctionChange}
                    style={{ width: '100%' }}
                />
            </div>

            {/* 输入参数映射 */}
            <div className={styles.field}>
                <div className={styles.fieldHeader}>
                    <span className={styles.fieldLabel}>输入参数映射</span>
                    <Button size="small" type="dashed" onClick={handleAddInputBinding}>+ 添加</Button>
                </div>
                {Object.entries(node.inputBindings).map(([key, flowValue]) => (
                    <div key={key} className={styles.bindingRow}>
                        <Input
                            size="small"
                            value={key}
                            onChange={(e) => handleInputKeyChange(key, e.target.value)}
                            placeholder="参数名"
                            style={{ width: 80 }}
                        />
                        <span className={styles.arrow}>→</span>
                        <Input
                            size="small"
                            value={flowValue.kind === 'literal' ? String(flowValue.value) : ''}
                            onChange={(e) => handleInputValueChange(key, e.target.value)}
                            placeholder="值"
                            style={{ flex: 1 }}
                        />
                        <Button
                            size="small"
                            type="text"
                            danger
                            onClick={() => handleRemoveInputBinding(key)}
                            style={{ padding: '0 4px', minWidth: 20 }}
                        >×</Button>
                    </div>
                ))}
                {Object.keys(node.inputBindings).length === 0 && (
                    <div className={styles.emptyHint}>暂无输入参数</div>
                )}
            </div>

            {/* 输出参数映射 */}
            <div className={styles.field}>
                <div className={styles.fieldHeader}>
                    <span className={styles.fieldLabel}>输出参数映射</span>
                    <Button size="small" type="dashed" onClick={handleAddOutputBinding}>+ 添加</Button>
                </div>
                {Object.entries(node.outputBindings).map(([key, pageVarKey]) => (
                    <div key={key} className={styles.bindingRow}>
                        <Input
                            size="small"
                            value={key}
                            onChange={(e) => handleOutputKeyChange(key, e.target.value)}
                            placeholder="返回字段"
                            style={{ width: 80 }}
                        />
                        <span className={styles.arrow}>→</span>
                        <Input
                            size="small"
                            value={pageVarKey}
                            onChange={(e) => handleOutputValueChange(key, e.target.value)}
                            placeholder="页面变量名"
                            style={{ flex: 1 }}
                        />
                        <Button
                            size="small"
                            type="text"
                            danger
                            onClick={() => handleRemoveOutputBinding(key)}
                            style={{ padding: '0 4px', minWidth: 20 }}
                        >×</Button>
                    </div>
                ))}
                {Object.keys(node.outputBindings).length === 0 && (
                    <div className={styles.emptyHint}>暂无输出映射</div>
                )}
            </div>
        </div>
    )
}

export { CloudFunctionNodeEditor }
export type { CloudFunctionNodeEditorProps }

/**
 * 辅助函数：从 FlowSchema 中查找选中的 callCloudFunction 节点
 */
export function findCloudFunctionNode(
    schema: FlowSchema | null,
    nodeId: string | null,
): (FlowNode & { kind: 'callCloudFunction' }) | null {
    if (!schema || !nodeId) return null
    const node = schema.nodes.find((n) => n.id === nodeId)
    if (!node || node.kind !== 'callCloudFunction') return null
    return node as FlowNode & { kind: 'callCloudFunction' }
}

/**
 * 辅助函数：更新 FlowSchema 中指定节点的数据
 */
export function updateNodeInSchema(
    schema: FlowSchema,
    updatedNode: FlowNode,
): FlowSchema {
    return {
        ...schema,
        nodes: schema.nodes.map((n) => (n.id === updatedNode.id ? updatedNode : n)),
    }
}
