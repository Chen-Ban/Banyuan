import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Tabs } from 'antd'
import type { IBanvasActions, IPageNode } from 'banvasgl'
import PropertiesTab from './PropertiesTab'
import StyleTab from './StyleTab'
import styles from './index.module.scss'

interface PropertyPanelProps {
    selectedViewId: string
    actions: IBanvasActions
    pages: IPageNode[]
    currentPageId: string | null
}

/**
 * lunlunglass 属性面板
 *
 * 仅保留「属性」和「样式」两个 tab，不包含数据和事件编排能力。
 * lunlunglass 只使用 BanvasGL 的渲染能力，低代码编排功能由 banyan 承载。
 */
const PropertyPanel: React.FC<PropertyPanelProps> = ({
    selectedViewId,
    actions,
    pages: _pages,
    currentPageId: _currentPageId,
}) => {
    const view = selectedViewId ? actions.view.getViewInstance(selectedViewId) : null

    const [activeTab, setActiveTab] = useState('properties')
    useEffect(() => {
        setActiveTab('properties')
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
        return (
            <div className={styles.panel}>
                <div className={styles.emptyState}>未选中元素</div>
            </div>
        )
    }

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
