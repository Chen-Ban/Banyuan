import React, { useCallback, useEffect, useRef, useState } from "react"
import { InputNumber, Radio, Tabs } from "antd"
import type { IBanvasActions } from "@banyuan/banvasgl"
import { FieldSchemaMapEditor } from "./FieldSchemaMapEditor"
import { PropertiesTab } from "./PropertiesTab"
import { StyleTab } from "./StyleTab"
import { DataTab } from "./DataTab"
import { EventsTab } from "./EventsTab"
import type { FlowEditorModalSlotProps } from "./EventsTab"
import styles from "./index.module.scss"

export interface PropertyPanelProps {
  selectedViewId: string
  actions: IBanvasActions
  currentPageId: string | null
  canvasSize: { width: number; height: number }
  onCanvasSizeChange: (width: number, height: number) => void
  FlowEditorModal?: React.ComponentType<FlowEditorModalSlotProps>
  appId?: string
}

const SCREEN_PRESETS = [
  {
    category: "PC",
    items: [
      { label: "1280 × 720 (HD)", width: 1280, height: 720 },
      { label: "1366 × 768", width: 1366, height: 768 },
      { label: "1440 × 900", width: 1440, height: 900 },
      { label: "1920 × 1080 (FHD)", width: 1920, height: 1080 },
      { label: "2560 × 1440 (2K)", width: 2560, height: 1440 },
    ],
  },
  {
    category: "Pad",
    items: [
      { label: "768 × 1024 (iPad Mini)", width: 768, height: 1024 },
      { label: "810 × 1080 (iPad 10)", width: 810, height: 1080 },
      { label: "820 × 1180 (iPad Air)", width: 820, height: 1180 },
      { label: "1024 × 1366 (iPad Pro 12.9)", width: 1024, height: 1366 },
    ],
  },
  {
    category: "Phone",
    items: [
      { label: "375 × 667 (iPhone SE)", width: 375, height: 667 },
      { label: "375 × 812 (iPhone X/12 mini)", width: 375, height: 812 },
      { label: "390 × 844 (iPhone 14)", width: 390, height: 844 },
      { label: "393 × 852 (iPhone 15)", width: 393, height: 852 },
      { label: "430 × 932 (iPhone 15 Pro Max)", width: 430, height: 932 },
    ],
  },
]

const ALL_PRESET_ITEMS = SCREEN_PRESETS.flatMap((g) => g.items)

export const PropertyPanel: React.FC<PropertyPanelProps> = ({
  selectedViewId,
  actions,
  currentPageId,
  canvasSize,
  onCanvasSizeChange,
  FlowEditorModal: FlowEditorModalSlot,
  appId,
}) => {
  const view = selectedViewId
    ? actions.view.getViewInstance(selectedViewId)
    : null

  const [activeTab, setActiveTab] = useState("properties")
  useEffect(() => {
    setActiveTab(selectedViewId ? "properties" : "data")
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
            if (currentPageId)
              actions.page.setPageData(currentPageId, key, schema)
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
              type: "string",
              default: "",
            })
          }}
        />
      </div>
    )

    const pageEventsTab = currentPageId ? (
      <EventsTab
        mode="page"
        pageId={currentPageId}
        actions={actions}
        FlowEditorModal={FlowEditorModalSlot}
        appId={appId}
      />
    ) : null

    const matchedPreset = ALL_PRESET_ITEMS.find(
      (p) => p.width === canvasSize.width && p.height === canvasSize.height,
    )

    const pageSizeTab = (
      <div className={styles.content}>
        <div className={styles.section}>
          <div className={styles.sectionHeader}>预设尺寸</div>
          <Radio.Group
            className={styles.presetGroup}
            value={
              matchedPreset
                ? `${matchedPreset.width}x${matchedPreset.height}`
                : null
            }
            onChange={(e) => {
              const preset = ALL_PRESET_ITEMS.find(
                (p) => `${p.width}x${p.height}` === e.target.value,
              )
              if (preset) onCanvasSizeChange(preset.width, preset.height)
            }}
          >
            {SCREEN_PRESETS.map((group) => (
              <div key={group.category} className={styles.presetCategory}>
                <div className={styles.presetCategoryLabel}>{group.category}</div>
                {group.items.map((p) => (
                  <Radio
                    key={`${p.width}x${p.height}`}
                    value={`${p.width}x${p.height}`}
                  >
                    {p.label}
                  </Radio>
                ))}
              </div>
            ))}
          </Radio.Group>
        </div>
        <div className={styles.section}>
          <div className={styles.sectionHeader}>自定义尺寸</div>
          <div className={styles.transformGrid}>
            <div className={styles.numberInputWrapper}>
              <span className={styles.inputLabel}>宽度 (px)</span>
              <InputNumber
                size="small"
                min={100}
                max={9999}
                value={canvasSize.width}
                onChange={(v) => {
                  if (v != null) onCanvasSizeChange(v, canvasSize.height)
                }}
                style={{ width: "100%" }}
              />
            </div>
            <div className={styles.numberInputWrapper}>
              <span className={styles.inputLabel}>高度 (px)</span>
              <InputNumber
                size="small"
                min={100}
                max={9999}
                value={canvasSize.height}
                onChange={(v) => {
                  if (v != null) onCanvasSizeChange(canvasSize.width, v)
                }}
                style={{ width: "100%" }}
              />
            </div>
          </div>
        </div>
      </div>
    )

    const pageTabItems = [
      { key: "data", label: "数据", children: pageDataTab },
      ...(pageEventsTab
        ? [{ key: "events", label: "事件", children: pageEventsTab }]
        : []),
      { key: "size", label: "页面尺寸", children: pageSizeTab },
    ]

    return (
      <div className={styles.panel}>
        <Tabs
          items={pageTabItems}
          size="small"
          activeKey={activeTab}
          onChange={setActiveTab}
          tabBarStyle={{ paddingLeft: 12, margin: 0, borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-content)' }}
        />
      </div>
    )
  }

  // ── 有选中时 ──
  const viewData = actions.view.getViewData(selectedViewId)

  const tabItems = [
    {
      key: "properties",
      label: "属性",
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
      key: "style",
      label: "样式",
      children: <StyleTab view={view} actions={actions} />,
    },
    {
      key: "data",
      label: "数据",
      children: (
        <DataTab
          selectedViewId={selectedViewId}
          actions={actions}
          viewData={viewData}
        />
      ),
    },
    {
      key: "events",
      label: "事件",
      children: (
        <EventsTab
          mode="view"
          selectedViewId={selectedViewId}
          actions={actions}
          FlowEditorModal={FlowEditorModalSlot}
          appId={appId}
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
