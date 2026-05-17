import React, { useCallback, useEffect, useRef, useState } from 'react'
import { InputNumber, Radio, Tabs } from 'antd'
import type { IBanvasActions, IPageNode } from 'banvasgl'
import FieldSchemaMapEditor from './FieldSchemaMapEditor'
import PropertiesTab from './PropertiesTab'
import StyleTab from './StyleTab'
import DataTab from './DataTab'
import EventsTab from './EventsTab'
import DatabaseTab from './DatabaseTab'
import styles from './index.module.scss'

interface PropertyPanelProps {
    selectedViewId: string
    actions: IBanvasActions
    pages: IPageNode[]
    currentPageId: string | null
    canvasSize: { width: number; height: number }
    onCanvasSizeChange: (width: number, height: number) => void
    /** 当前应用 ID（已保存的应用才有，新建应用为 undefined） */
    appId?: string
}

const PropertyPanel: React.FC<PropertyPanelProps> = ({
    selectedViewId,
    actions,
    pages,
    currentPageId,
    canvasSize,
    onCanvasSizeChange,
    appId,
}) => {
    const view = selectedViewId ? actions.view.getViewInstance(selectedViewId) : null

    // 切换选中元素时，重置 tab 到第一个
    const [activeTab, setActiveTab] = useState('properties')
    useEffect(() => {
        setActiveTab(selectedViewId ? 'properties' : 'data')
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

    // ── 无选中时：展示当前页面面板（数据 + 事件） ──
    if (!view) {
        const currentPage = pages.find((p) => p.id === currentPageId) ?? null
        const pageData = currentPage ? currentPage.data : {}

        const pageDataTab = (
            <div className={styles.tabContent}>
                <FieldSchemaMapEditor
                    title="页面数据 (data)"
                    schemaMap={pageData}
                    onUpdate={(key, schema) => {
                        if (currentPageId) actions.page.setPageData(currentPageId, key, schema)
                    }}
                    onDelete={(key) => {
                        if (currentPageId) actions.page.deletePageData(currentPageId, key)
                    }}
                    onAdd={(key, schema) => {
                        if (currentPageId) actions.page.setPageData(currentPageId, key, schema)
                    }}
                />
            </div>
        )

        const pageEventsTab = currentPageId ? (
            <EventsTab mode="page" pageId={currentPageId} actions={actions} />
        ) : null

        const SCREEN_PRESETS = [
            { label: '1280 × 800', width: 1280, height: 800 },
            { label: '1366 × 768', width: 1366, height: 768 },
            { label: '1440 × 900', width: 1440, height: 900 },
            { label: '1920 × 1080', width: 1920, height: 1080 },
            { label: '2560 × 1440', width: 2560, height: 1440 },
            { label: '375 × 812（iPhone）', width: 375, height: 812 },
            { label: '390 × 844（iPhone Pro）', width: 390, height: 844 },
            { label: '768 × 1024（iPad）', width: 768, height: 1024 },
        ]

        const matchedPreset = SCREEN_PRESETS.find(
            (p) => p.width === canvasSize.width && p.height === canvasSize.height,
        )

        const pageSizeTab = (
            <div className={styles.tabContent}>
                <div className={styles.section}>
                    <div className={styles.sectionHeader}>预设尺寸</div>
                    <Radio.Group
                        className={styles.presetGroup}
                        value={matchedPreset ? `${matchedPreset.width}x${matchedPreset.height}` : null}
                        onChange={(e) => {
                            const preset = SCREEN_PRESETS.find(
                                (p) => `${p.width}x${p.height}` === e.target.value,
                            )
                            if (preset) onCanvasSizeChange(preset.width, preset.height)
                        }}
                    >
                        {SCREEN_PRESETS.map((p) => (
                            <Radio key={`${p.width}x${p.height}`} value={`${p.width}x${p.height}`}>
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
            { key: 'data', label: '数据', children: pageDataTab },
            ...(pageEventsTab ? [{ key: 'events', label: '事件', children: pageEventsTab }] : []),
            { key: 'size', label: '页面尺寸', children: pageSizeTab },
            ...(appId
                ? [{ key: 'database', label: '数据库', children: <DatabaseTab appId={appId} /> }]
                : []),
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

    // ── 有选中时：读取数据 ──
    const viewData = actions.view.getViewData(selectedViewId)

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
        {
            key: 'data',
            label: '数据',
            children: (
                <DataTab
                    selectedViewId={selectedViewId}
                    actions={actions}
                    viewData={viewData}
                />
            ),
        },
        {
            key: 'events',
            label: '事件',
            children: (
                <EventsTab
                    mode="view"
                    selectedViewId={selectedViewId}
                    actions={actions}
                />
            ),
        },
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
