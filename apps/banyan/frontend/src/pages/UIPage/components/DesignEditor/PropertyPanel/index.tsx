import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Tabs } from 'antd'
import type { IBanvasActions } from '@banyuan/banvasgl'
import { FieldSchemaMapEditor } from './FieldSchemaMapEditor'
import { PropertiesTab } from './PropertiesTab'
import { DataTab } from './DataTab'
import { EventsTab } from './EventsTab'
import type { FlowEditorOpenRequest } from './EventsTab'
import styles from './index.module.scss'

export interface PropertyPanelProps {
  selectedViewId: string
  actions: IBanvasActions
  currentPageId: string | null
  /** 请求打开流程编辑面板（状态提升到 UIPage） */
  onOpenFlowEditor?: (request: FlowEditorOpenRequest) => void
}

export const PropertyPanel: React.FC<PropertyPanelProps> = ({
  selectedViewId,
  actions,
  currentPageId,
  onOpenFlowEditor,
}) => {
  const view = selectedViewId ? actions.view.getViewInstance(selectedViewId) : null

  const [activeTab, setActiveTab] = useState('appearance')
  useEffect(() => {
    setActiveTab(selectedViewId ? 'appearance' : 'data')
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

  // ── 无选中时：展示当前页面面板 ──
  if (!view) {
    const pageData = currentPageId ? actions.page.getPageData(currentPageId) : {}

    const pageDataTab = (
      <div className={styles.content}>
        <FieldSchemaMapEditor
          title="页面数据 (data)"
          schemaMap={pageData}
          onUpdate={(key, schema) => {
            if (currentPageId) actions.page.setPageData(currentPageId, key, schema)
          }}
          onRename={(oldKey, newKey) => {
            if (currentPageId) {
              const schema = pageData[oldKey]
              if (schema) {
                actions.page.deletePageData(currentPageId, oldKey)
                actions.page.setPageData(currentPageId, newKey, schema)
              }
            }
          }}
          onDelete={(key) => {
            if (currentPageId) actions.page.deletePageData(currentPageId, key)
          }}
          onAdd={() => {
            if (!currentPageId) return
            const existingKeys = Object.keys(pageData)
            let n = existingKeys.length + 1
            let newKey = `field_${n}`
            while (existingKeys.includes(newKey)) newKey = `field_${++n}`
            actions.page.setPageData(currentPageId, newKey, {
              type: 'string',
              default: '',
            })
          }}
        />
      </div>
    )

    const pageEventsTab = currentPageId ? (
      <EventsTab mode="page" pageId={currentPageId} actions={actions} onOpenFlowEditor={onOpenFlowEditor} />
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
          activeKey={activeTab}
          onChange={setActiveTab}
          tabBarStyle={{
            paddingLeft: 12,
            margin: 0,
            borderBottom: '1px solid var(--color-border)',
            background: 'var(--color-bg-content)',
          }}
        />
      </div>
    )
  }

  // ── 有选中时 ──
  const viewData = actions.view.getViewData(selectedViewId)

  const tabItems = [
    {
      key: 'appearance',
      label: '外观',
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
      key: 'data',
      label: '数据',
      children: <DataTab selectedViewId={selectedViewId} actions={actions} viewData={viewData} />,
    },
    {
      key: 'events',
      label: '事件',
      children: (
        <EventsTab
          mode="view"
          selectedViewId={selectedViewId}
          actions={actions}
          onOpenFlowEditor={onOpenFlowEditor}
        />
      ),
    },
  ]

  return (
    <div className={styles.panel}>
      <Tabs
        items={tabItems}
        size="small"
        activeKey={activeTab}
        onChange={setActiveTab}
        tabBarStyle={{ paddingLeft: 12, margin: 0 }}
      />
    </div>
  )
}

export default PropertyPanel
