import React, { useState } from 'react'
import { Button, Tooltip, Popover } from 'antd'
import { ArrowLeftOutlined, SaveOutlined, EllipsisOutlined } from '@ant-design/icons'
import styles from './index.module.scss'

export interface ComponentDragData {
    viewType: 'GraphView' | 'TextView' | 'ImageView'
    graphType?: 'Line' | 'Circle' | 'Rectangle'
    constructorParams: Record<string, unknown>
}

interface ComponentPaletteProps {
    templateName: string
    templateDescription: string
    saving: boolean
    isNew: boolean
    onNameChange: (value: string) => void
    onDescriptionChange: (value: string) => void
    onSave: () => void
    onBack: () => void
}

/** 组件定义 */
const COMPONENTS: Array<{
    key: string
    label: string
    dragData: ComponentDragData
    icon: React.ReactNode
}> = [
    {
        key: 'line',
        label: '直线',
        dragData: { viewType: 'GraphView', graphType: 'Line', constructorParams: {} },
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24">
                <line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" strokeWidth="2" />
            </svg>
        ),
    },
    {
        key: 'circle',
        label: '圆形',
        dragData: {
            viewType: 'GraphView',
            graphType: 'Circle',
            constructorParams: { center: { x: 50, y: 50, z: 0 }, radius: 50 },
        },
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
        ),
    },
    {
        key: 'rectangle',
        label: '矩形',
        dragData: {
            viewType: 'GraphView',
            graphType: 'Rectangle',
            constructorParams: { x: 0, y: 0, width: 100, height: 100 },
        },
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24">
                <rect x="4" y="4" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
        ),
    },
    {
        key: 'text',
        label: '文本',
        dragData: { viewType: 'TextView', constructorParams: { text: '文本' } },
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24">
                <text x="12" y="17" textAnchor="middle" fontSize="14" fill="currentColor" fontWeight="bold">
                    T
                </text>
            </svg>
        ),
    },
    {
        key: 'image',
        label: '图片',
        dragData: {
            viewType: 'ImageView',
            constructorParams: { x: 0, y: 0, imageSrc: 'https://picsum.photos/200/300' },
        },
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24">
                <rect x="3" y="5" width="18" height="14" fill="none" stroke="currentColor" strokeWidth="2" rx="1" />
                <circle cx="8" cy="10" r="2" fill="currentColor" />
                <polyline points="3,16 9,12 14,15 18,11 21,14" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
        ),
    },
]

/** 栅格最多展示 3列x2行 = 6 个 */
const MAX_VISIBLE = 6

const ComponentPalette: React.FC<ComponentPaletteProps> = ({
    templateName,
    templateDescription,
    saving,
    isNew,
    onNameChange,
    onDescriptionChange,
    onSave,
    onBack,
}) => {
    const [moreOpen, setMoreOpen] = useState(false)

    const handleDragStart = (e: React.DragEvent, data: ComponentDragData) => {
        e.dataTransfer.setData('application/json', JSON.stringify(data))
        e.dataTransfer.effectAllowed = 'copy'
    }

    const visibleComponents = COMPONENTS.slice(0, MAX_VISIBLE)
    const overflowComponents = COMPONENTS.slice(MAX_VISIBLE)

    const renderComponentItem = (comp: typeof COMPONENTS[number]) => (
        <Tooltip key={comp.key} title={comp.label} placement="bottom">
            <div
                className={styles.componentItem}
                draggable
                onDragStart={e => handleDragStart(e, comp.dragData)}
            >
                {comp.icon}
            </div>
        </Tooltip>
    )

    const overflowPanel = (
        <div className={styles.overflowGrid}>
            {overflowComponents.map(renderComponentItem)}
        </div>
    )

    return (
        <div className={styles.palette}>
            {/* 左侧：Header 操作区 */}
            <div className={styles.headerSection}>
                <Button
                    type="text"
                    size="small"
                    icon={<ArrowLeftOutlined />}
                    onClick={onBack}
                    className={styles.backBtn}
                />
                <div className={styles.infoFields}>
                    <input
                        className={styles.fieldInput}
                        placeholder="未命名模板"
                        value={templateName}
                        onChange={e => onNameChange(e.target.value)}
                    />
                    <input
                        className={`${styles.fieldInput} ${styles.descInput}`}
                        placeholder="添加描述..."
                        value={templateDescription}
                        onChange={e => onDescriptionChange(e.target.value)}
                    />
                </div>
                <Tooltip title={isNew ? '创建模板' : '保存模板'}>
                    <Button
                        type="text"
                        icon={<SaveOutlined />}
                        loading={saving}
                        onClick={onSave}
                        className={styles.saveBtn}
                    />
                </Tooltip>
            </div>

            {/* 分隔线 */}
            <div className={styles.divider} />

            {/* 右侧：组件区域（3x3 栅格） */}
            <div className={styles.componentsSection}>
                <div className={styles.componentsGrid}>
                    {visibleComponents.map(renderComponentItem)}
                </div>
                {overflowComponents.length > 0 && (
                    <Popover
                        content={overflowPanel}
                        trigger="click"
                        placement="bottomRight"
                        open={moreOpen}
                        onOpenChange={setMoreOpen}
                    >
                        <div className={styles.moreBtn}>
                            <EllipsisOutlined />
                        </div>
                    </Popover>
                )}
            </div>
        </div>
    )
}

export default ComponentPalette
