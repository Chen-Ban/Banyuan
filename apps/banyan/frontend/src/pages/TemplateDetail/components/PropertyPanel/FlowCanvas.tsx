import React, { useCallback, useMemo } from 'react'
import { useFlowBanvas } from 'banvasgl'
import type { FlowSchema } from 'banvasgl'
import styles from './index.module.scss'

interface FlowCanvasProps {
    /** 当前绑定的 FlowSchema（null 表示尚未绑定） */
    schema: FlowSchema | null
    /** schema 变更回调 */
    onChange: (schema: FlowSchema) => void
}

const CANVAS_WIDTH = 236
const CANVAS_HEIGHT = 300

/**
 * 函数编辑画布
 *
 * 用 useFlowBanvas 初始化一个独立的流程图编辑器，
 * 支持拖拽移动节点和端口连线，不支持框选/文本编辑/事务等主编辑器功能。
 * 交互结束后通过 onChange 将最新 FlowSchema 写回外部。
 */
const FlowCanvas: React.FC<FlowCanvasProps> = ({ schema, onChange }) => {
    // 将 FlowSchema 序列化为 BanvasGL 可识别的 Scene JSON
    // 目前传空数组让引擎创建默认空白 Scene，后续扩展为从 schema 反序列化
    const serializedScenes = useMemo<string[]>(() => [], [])

    const handleSchemaChange = useCallback(() => {
        // TODO: 从 app.getCurrentScene() 读取 NodeView/EdgeView 并序列化为 FlowSchema
        // 暂时回写一个空 schema
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

    return (
        <div className={styles.flowCanvasWrapper}>
            {Canvas}
        </div>
    )
}

export default FlowCanvas
