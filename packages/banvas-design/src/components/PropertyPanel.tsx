import React, { useCallback, useEffect, useRef, useState } from "react";
import { InputNumber, Radio, Tabs } from "antd";
import type { IBanvasActions, IPageNode } from "@banyuan/banvasgl";
import { FieldSchemaMapEditor } from "./FieldSchemaMapEditor.js";
import { PropertiesTab } from "./PropertiesTab.js";
import { StyleTab } from "./StyleTab.js";
import { DataTab } from "./DataTab.js";
import { EventsTab } from "./EventsTab.js";
import type { FlowEditorModalSlotProps } from "./EventsTab.js";

// ── 内联样式 ──

const panelStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  overflowY: "auto",
  borderLeft: "1px solid #e9ecef",
  background: "#fafbfc",
  fontSize: 12,
  color: "#2c3e50",
  display: "flex",
  flexDirection: "column",
};

const tabContentStyle: React.CSSProperties = { padding: 12 };

const sectionStyle: React.CSSProperties = {
  marginBottom: 16,
  paddingBottom: 12,
  borderBottom: "1px solid #ecf0f1",
};

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#7f8c8d",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  marginBottom: 8,
};

const transformGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 6,
};

const numberInputWrapperStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const inputLabelStyle: React.CSSProperties = {
  fontSize: 10,
  color: "#95a5a6",
  fontWeight: 500,
};

const presetGroupStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

// ── 组件 ──

export interface PropertyPanelProps {
  selectedViewId: string;
  actions: IBanvasActions;
  pages: IPageNode[];
  currentPageId: string | null;
  canvasSize: { width: number; height: number };
  onCanvasSizeChange: (width: number, height: number) => void;
  /** FlowEditorModal 组件（由外部注入，避免 banvas-design 依赖 flow-design） */
  FlowEditorModal?: React.ComponentType<FlowEditorModalSlotProps>;
  appId?: string;
}

const SCREEN_PRESETS = [
  { label: "1280 × 800", width: 1280, height: 800 },
  { label: "1366 × 768", width: 1366, height: 768 },
  { label: "1440 × 900", width: 1440, height: 900 },
  { label: "1920 × 1080", width: 1920, height: 1080 },
  { label: "2560 × 1440", width: 2560, height: 1440 },
  { label: "375 × 812（iPhone）", width: 375, height: 812 },
  { label: "390 × 844（iPhone Pro）", width: 390, height: 844 },
  { label: "768 × 1024（iPad）", width: 768, height: 1024 },
];

export const PropertyPanel: React.FC<PropertyPanelProps> = ({
  selectedViewId,
  actions,
  pages,
  currentPageId,
  canvasSize,
  onCanvasSizeChange,
  FlowEditorModal: FlowEditorModalSlot,
  appId,
}) => {
  const view = selectedViewId
    ? actions.view.getViewInstance(selectedViewId)
    : null;

  // 切换选中元素时，重置 tab 到第一个
  const [activeTab, setActiveTab] = useState("properties");
  useEffect(() => {
    setActiveTab(selectedViewId ? "properties" : "data");
  }, [selectedViewId]);

  const isEditingRef = useRef(false);

  const handleFocus = useCallback(() => {
    if (!isEditingRef.current) {
      actions.view.beginPropertyEdit();
      isEditingRef.current = true;
    }
  }, [actions]);

  const handleBlur = useCallback(() => {
    if (isEditingRef.current) {
      actions.view.commitPropertyEdit();
      isEditingRef.current = false;
    }
  }, [actions]);

  // ── 无选中时：展示当前页面面板（数据 + 事件） ──
  if (!view) {
    const currentPage = pages.find((p) => p.id === currentPageId) ?? null;
    const pageData = currentPage ? currentPage.data : {};

    const pageDataTab = (
      <div style={tabContentStyle}>
        <FieldSchemaMapEditor
          title="页面数据 (data)"
          schemaMap={pageData}
          onUpdate={(key, schema) => {
            if (currentPageId)
              actions.page.setPageData(currentPageId, key, schema);
          }}
          onRename={(oldKey, newKey) => {
            if (currentPageId) {
              const schema = pageData[oldKey];
              if (schema) {
                actions.page.deletePageData(currentPageId, oldKey);
                actions.page.setPageData(currentPageId, newKey, schema);
              }
            }
          }}
          onDelete={(key) => {
            if (currentPageId) actions.page.deletePageData(currentPageId, key);
          }}
          onAdd={() => {
            if (!currentPageId) return;
            const existingKeys = Object.keys(pageData);
            let n = existingKeys.length + 1;
            let newKey = `field_${n}`;
            while (existingKeys.includes(newKey)) newKey = `field_${++n}`;
            actions.page.setPageData(currentPageId, newKey, {
              type: "string",
              default: "",
            });
          }}
        />
      </div>
    );

    const pageEventsTab = currentPageId ? (
      <EventsTab
        mode="page"
        pageId={currentPageId}
        actions={actions}
        FlowEditorModal={FlowEditorModalSlot}
        appId={appId}
      />
    ) : null;

    const matchedPreset = SCREEN_PRESETS.find(
      (p) => p.width === canvasSize.width && p.height === canvasSize.height,
    );

    const pageSizeTab = (
      <div style={tabContentStyle}>
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>预设尺寸</div>
          <Radio.Group
            style={presetGroupStyle}
            value={
              matchedPreset
                ? `${matchedPreset.width}x${matchedPreset.height}`
                : null
            }
            onChange={(e) => {
              const preset = SCREEN_PRESETS.find(
                (p) => `${p.width}x${p.height}` === e.target.value,
              );
              if (preset) onCanvasSizeChange(preset.width, preset.height);
            }}
          >
            {SCREEN_PRESETS.map((p) => (
              <Radio
                key={`${p.width}x${p.height}`}
                value={`${p.width}x${p.height}`}
              >
                {p.label}
              </Radio>
            ))}
          </Radio.Group>
        </div>
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>自定义尺寸</div>
          <div style={transformGridStyle}>
            <div style={numberInputWrapperStyle}>
              <span style={inputLabelStyle}>宽度 (px)</span>
              <InputNumber
                size="small"
                min={100}
                max={9999}
                value={canvasSize.width}
                onChange={(v) => {
                  if (v != null) onCanvasSizeChange(v, canvasSize.height);
                }}
                style={{ width: "100%" }}
              />
            </div>
            <div style={numberInputWrapperStyle}>
              <span style={inputLabelStyle}>高度 (px)</span>
              <InputNumber
                size="small"
                min={100}
                max={9999}
                value={canvasSize.height}
                onChange={(v) => {
                  if (v != null) onCanvasSizeChange(canvasSize.width, v);
                }}
                style={{ width: "100%" }}
              />
            </div>
          </div>
        </div>
      </div>
    );

    const pageTabItems = [
      { key: "data", label: "数据", children: pageDataTab },
      ...(pageEventsTab
        ? [{ key: "events", label: "事件", children: pageEventsTab }]
        : []),
      { key: "size", label: "页面尺寸", children: pageSizeTab },
    ];

    return (
      <div style={panelStyle}>
        <Tabs
          items={pageTabItems}
          size="small"
          activeKey={activeTab}
          onChange={setActiveTab}
          tabBarStyle={{ paddingLeft: 12, margin: 0 }}
        />
      </div>
    );
  }

  // ── 有选中时：读取数据 ──
  const viewData = actions.view.getViewData(selectedViewId);

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
      children: <StyleTab view={view} />,
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
  ];

  return (
    <div style={panelStyle}>
      <Tabs
        items={tabItems}
        size="small"
        activeKey={activeTab}
        onChange={setActiveTab}
        tabBarStyle={{ paddingLeft: 12, margin: 0 }}
      />
    </div>
  );
};

export default PropertyPanel;
