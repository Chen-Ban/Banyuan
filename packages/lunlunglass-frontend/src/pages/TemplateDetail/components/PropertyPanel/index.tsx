import React, { useCallback, useRef } from 'react'
import { Tabs } from 'antd'
import type { IBanvasActions, IPageNode } from 'banvasgl'
import FieldSchemaMapEditor from './FieldSchemaMapEditor'
import PropertiesTab from './PropertiesTab'
import StyleTab from './StyleTab'
import DataTab from './DataTab'
import EventsTab from './EventsTab'
import styles from './index.module.scss'

interface PropertyPanelProps {
    selectedViewId: string
    actions: IBanvasActions
    pages: IPageNode[]
    currentPageId: string | null
}

const PropertyPanel: React.FC<PropertyPanelProps> = ({
    selectedViewId,
    actions,
    pages,
    currentPageId,
}) => {
    const view = selectedViewId ? actions.view.getViewInstance(selectedViewId) : null

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

        const pageTabItems = [
            { key: 'data', label: '数据', children: pageDataTab },
            ...(pageEventsTab ? [{ key: 'events', label: '事件', children: pageEventsTab }] : []),
        ]

        return (
            <div className={styles.panel}>
                <Tabs
                    items={pageTabItems}
                    size="small"
                    className={styles.tabs}
                    defaultActiveKey="data"
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
                defaultActiveKey="properties"
            />
        </div>
    )
}

export default PropertyPanel
