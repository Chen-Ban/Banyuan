import React, { useCallback, useEffect, useRef, useState } from 'react'
import { InputNumber, Radio, Tabs } from 'antd'
import type { IBanvasActions, IPageNode } from '@banyuan/banvasgl'
import { VIEWTYPE } from '@banyuan/banvasgl'
import PropertiesTab from './PropertiesTab'
import StyleTab from './StyleTab'
import DataTab from './DataTab'
import styles from './index.module.scss'

interface PropertyPanelProps {
    selectedViewId: string
    actions: IBanvasActions
    pages: IPageNode[]
    currentPageId: string | null
    canvasSize: { width: number; height: number }
    onCanvasSizeChange: (width: number, height: number) => void
}

/**
 * lunlunglass Studio 属性面板
 *
 * 包含「属性」、「样式」两个 tab，以及仅在 TextView 选中时显示的「字段绑定」tab。
 * 不包含事件编排能力（lunlunglass 只使用 BanvasGL 的渲染能力）。
 */
const PropertyPanel: React.FC<PropertyPanelProps> = ({
    selectedViewId,
    actions,
    pages: _pages,
    currentPageId: _currentPageId,
    canvasSize,
    onCanvasSizeChange,
}) => {
    const view = selectedViewId ? actions.view.getViewInstance(selectedViewId) : null

    const [activeTab, setActiveTab] = useState('properties')
    useEffect(() => {
        setActiveTab(selectedViewId ? 'properties' : 'size')
    }, [selectedViewId])

    const isEditingRef = useRef(false)

    const handleFocus = useCallback(() => {
        if (!isEditingRef.current) {
            actions.view.beginPropertyEdit()
            isEditingRef.current = true
        }
    }, [actions])

    const handleBlur = useCallback(() => {
        if (isEditingRef.current) {
            actions.view.commitPropertyEdit()
            isEditingRef.current = false
        }
    }, [actions])

    if (!view) {
        // 热敏打印机常见纸宽（单位 px，96dpi）
        // 58mm ≈ 220px，80mm ≈ 302px，110mm ≈ 416px
        const PRINTER_WIDTH_PRESETS = [
            { label: '58mm（220px）', width: 220 },
            { label: '80mm（302px）', width: 302 },
            { label: '110mm（416px）', width: 416 },
        ]

        const matchedWidth = PRINTER_WIDTH_PRESETS.find((p) => p.width === canvasSize.width)

        const pageSizeTab = (
            <div className={styles.tabContent}>
                <div className={styles.section}>
                    <div className={styles.sectionHeader}>纸宽预设</div>
                    <Radio.Group
                        className={styles.presetGroup}
                        value={matchedWidth ? matchedWidth.width : null}
                        onChange={(e) => {
                            onCanvasSizeChange(e.target.value as number, canvasSize.height)
                        }}
                    >
                        {PRINTER_WIDTH_PRESETS.map((p) => (
                            <Radio key={p.width} value={p.width}>
                                {p.label}
                            </Radio>
                        ))}
                    </Radio.Group>
                </div>
                <div className={styles.section}>
                    <div className={styles.sectionHeader}>自定义尺寸</div>
                    <div className={styles.transformGrid}>
                        <div className={styles.numberInput}>
                            <span className={styles.inputLabel}>宽度 (px)</span>
                            <InputNumber
                                size="small"
                                min={100}
                                max={9999}
                                value={canvasSize.width}
                                onChange={(v) => {
                                    if (v != null) onCanvasSizeChange(v, canvasSize.height)
                                }}
                                style={{ width: '100%' }}
                            />
                        </div>
                        <div className={styles.numberInput}>
                            <span className={styles.inputLabel}>高度 (px)</span>
                            <InputNumber
                                size="small"
                                min={100}
                                max={9999}
                                value={canvasSize.height}
                                onChange={(v) => {
                                    if (v != null) onCanvasSizeChange(canvasSize.width, v)
                                }}
                                style={{ width: '100%' }}
                            />
                        </div>
                    </div>
                </div>
            </div>
        )

        const pageTabItems = [
            { key: 'size', label: '页面尺寸', children: pageSizeTab },
        ]

        return (
            <div className={styles.panel}>
                <Tabs
                    items={pageTabItems}
                    size="small"
                    className={styles.tabs}
                    activeKey={activeTab}
                    onChange={setActiveTab}
                />
            </div>
        )
    }

    // 仅 TextView 显示字段绑定 Tab
    const isTextView = view.type === VIEWTYPE.TEXTVIEW

    const tabItems = [
        {
            key: 'properties',
            label: '属性',
            children: (
                <PropertiesTab
                    view={view}
                    selectedViewId={selectedViewId}
                    actions={actions}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                />
            ),
        },
        {
            key: 'style',
            label: '样式',
            children: <StyleTab view={view} />,
        },
        ...(isTextView ? [{
            key: 'data',
            label: '字段绑定',
            children: (
                <DataTab
                    view={view}
                    selectedViewId={selectedViewId}
                    actions={actions}
                />
            ),
        }] : []),
    ]

    return (
        <div className={styles.panel}>
            <Tabs
                items={tabItems}
                size="small"
                className={styles.tabs}
                activeKey={activeTab}
                onChange={setActiveTab}
            />
        </div>
    )
}

export default PropertyPanel
