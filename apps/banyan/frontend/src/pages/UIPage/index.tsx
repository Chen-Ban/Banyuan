/**
 * UIPage — 画布子页面
 *
 * 布局：
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  mainContent (flex row)                                   │
 *   │  ┌───────────────────────────┬────────────────────────┐  │
 *   │  │  canvasSection (flex: 1)  │  FlowEditorPanel       │  │
 *   │  │  ┌─────────────────────┐  │  (width: 560px,        │  │
 *   │  │  │  画布 + 浮层抽屉     │  │   条件渲染, 挤压画布)   │  │
 *   │  │  └─────────────────────┘  │                        │  │
 *   │  └───────────────────────────┴────────────────────────┘  │
 *   └──────────────────────────────────────────────────────────┘
 *
 * 职责：
 *   - 调用 useDesignBanvas hook（内部完成 store ↔ 引擎全部桥接）
 *   - 渲染物料面板、画布、PropertyDrawer
 *   - 管理 FlowEditorPanel 状态（从 EventsTab 提升）
 *
 * 设计决策来源：docs/specs/app/metadata-dataflow.md 步骤 7
 */

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import useDesignBanvas from "@/hooks/useDesignBanvas";
import { DesignContextMenu } from "./components/DesignEditor/DesignContextMenu";
import { Drawer, Tooltip } from "antd";
import { AppstoreOutlined } from "@ant-design/icons";
import UnifiedMaterialPanel from "@/components/UnifiedMaterialPanel";
import { FlowEditorPanel } from "@/components/FlowKit/FlowEditorPanel";
import type { FlowEditorOpenRequest } from "./components/DesignEditor/PropertyPanel/EventsTab";
import type { ExtractedFlowSchema } from "@/components/FlowKit/extractSchema";
import { FLOW_SCHEMA_VERSION } from "@banyuan/banvasgl";
import PropertyDrawer from "./components/PropertyDrawer";
import SaveMaterialModal from "@/components/SaveMaterialModal";
import styles from "./index.module.scss";

/** FlowEditorPanel 的状态 */
interface FlowEditorState {
  open: boolean;
  title: string;
  initialSchema: ExtractedFlowSchema;
  onSave: (schema: ExtractedFlowSchema) => void;
}

const CLOSED_FLOW_EDITOR: FlowEditorState = {
  open: false,
  title: "",
  initialSchema: {
    version: FLOW_SCHEMA_VERSION,
    entry: "",
    nodes: {},
    layout: {},
  },
  onSave: () => {},
};

const UIPage = () => {
  const { id: application_id } = useParams<{ id: string }>();

  // canvasSection 容器，作为两个抽屉的挂载容器（仅覆盖画布区域）
  const [canvasSectionEl, setCanvasSectionEl] = useState<HTMLDivElement | null>(
    null,
  );
  const canvasSectionRef = useCallback((el: HTMLDivElement | null) => {
    setCanvasSectionEl(el);
  }, []);

  // ── 流程编辑面板状态（从 EventsTab 提升） ────────────────────────────────────
  const [flowEditor, setFlowEditor] =
    useState<FlowEditorState>(CLOSED_FLOW_EDITOR);

  const handleOpenFlowEditor = useCallback((request: FlowEditorOpenRequest) => {
    setFlowEditor({
      open: true,
      title: request.title,
      initialSchema: request.initialSchema,
      onSave: request.onSave,
    });
    // 唤出流程面板时关闭属性抽屉，避免视觉拥挤
    setRightOpen(false);
  }, []);

  const handleCloseFlowEditor = useCallback(() => {
    setFlowEditor(CLOSED_FLOW_EDITOR);
  }, []);

  const [rightOpen, setRightOpen] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const prevSelectedViewIdRef = useRef<string>("");

  // banvasOptions 仅含配置（appOptions/rendererOptions）
  const banvasOptions = useMemo(
    () => ({
      appOptions: {
        enablePageStack: true,
        maxPageStackSize: 50,
        flowEnabled: false,
      },
      rendererOptions: {
        clearColor: "#fff",
      },
    }),
    [],
  );

  const {
    Banvas,
    currentPageId,
    selectedViewId,
    actions,
    contextMenu,
    saveMaterial,
  } = useDesignBanvas(banvasOptions);

  useEffect(() => {
    if (selectedViewId !== "") {
      setRightOpen(true);
    } else if (prevSelectedViewIdRef.current === "") {
      setRightOpen(false);
    }
    prevSelectedViewIdRef.current = selectedViewId;
  }, [selectedViewId]);

  if (!application_id) {
    return <div style={{ padding: 40, textAlign: "center" }}>缺少应用 ID</div>;
  }

  return (
    <div className={styles.page}>
      {/* ── 画布区域：物料 + 画布 + PropertyDrawer + FlowEditorPanel ── */}
      <div className={styles.mainContent}>
        <div className={styles.canvasSection} ref={canvasSectionRef}>
          {/* 画布（Banvas 内部已有 div 包裹） */}
          {Banvas}

          {/* 物料面板触发按钮（overlay 在画布左上角，抽屉打开时向右偏移） */}
          <Tooltip
            title={paletteOpen ? "收起组件" : "组件物料"}
            placement="right"
          >
            <button
              className={`${styles.paletteToggleBtn}${paletteOpen ? ` ${styles.paletteToggleBtnOpen}` : ""}`}
              onClick={() => setPaletteOpen((v) => !v)}
              aria-label="打开组件面板"
            >
              <AppstoreOutlined />
            </button>
          </Tooltip>

          {/* 物料抽屉（挂载在 canvasSection，从左侧弹出，不占画布空间） */}
          <Drawer
            open={paletteOpen}
            onClose={() => setPaletteOpen(false)}
            placement="left"
            size={260}
            mask={false}
            closable={false}
            classNames={{ body: styles.drawerBody }}
            getContainer={canvasSectionEl ?? false}
            rootStyle={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              height: "100%",
            }}
            styles={{
              wrapper: {
                top: 12,
                bottom: 12,
                left: 12,
                height: "calc(100% - 24px)",
                borderRadius: 12,
                border: "1px solid rgba(255, 255, 255, 0.1)",
                overflow: "hidden",
                boxShadow: "0 8px 32px rgba(0,0,0,0.55)",
              },
              section: {
                borderRadius: 12,
                overflow: "hidden",
              },
            }}
          >
            <UnifiedMaterialPanel mode="render" />
          </Drawer>

          {/* 属性面板（挂载在 canvasSection，从右侧弹出，不占画布空间） */}
          <PropertyDrawer
            open={rightOpen}
            onToggle={() => setRightOpen((v) => !v)}
            container={canvasSectionEl}
            selectedViewId={selectedViewId}
            actions={actions}
            currentPageId={currentPageId || ""}
            onOpenFlowEditor={handleOpenFlowEditor}
          />
        </div>

        {/* 流程编辑面板（flex item，打开时挤压左侧画布区域） */}
        <FlowEditorPanel
          open={flowEditor.open}
          title={flowEditor.title}
          initialSchema={flowEditor.initialSchema}
          onSave={flowEditor.onSave}
          onClose={handleCloseFlowEditor}
        />
      </div>

      <DesignContextMenu state={contextMenu} />

      {/* ── 保存为物料弹窗 ── */}
      {saveMaterial.open && (
        <SaveMaterialModal
          open={saveMaterial.open}
          onClose={saveMaterial.close}
          viewId={saveMaterial.viewId}
          actions={actions}
        />
      )}
    </div>
  );
};

export default UIPage;
