import React from "react";
import { Drawer } from "antd";
import { PropertyPanel, FlowEditorModal } from "@banyuan/banyan-sdk";
import type { useDesignBanvas } from "@banyuan/banyan-sdk";
import styles from "./index.module.scss";

type DesignBanvasReturn = ReturnType<typeof useDesignBanvas>;

export interface PropertyDrawerProps {
  open: boolean;
  onToggle: () => void;
  container: HTMLDivElement;
  selectedViewId: string;
  actions: DesignBanvasReturn["actions"];
  pages: DesignBanvasReturn["pages"];
  currentPageId: string;
  canvasSize: { width: number; height: number };
  onCanvasSizeChange: (width: number, height: number) => void;
  appId?: string;
  appSelected?: boolean;
}

const PropertyDrawer: React.FC<PropertyDrawerProps> = ({
  open,
  onToggle,
  selectedViewId,
  actions,
  pages,
  currentPageId,
  canvasSize,
  onCanvasSizeChange,
  appId,
  appSelected,
}) => {
  return (
    <div className={styles.drawerWrapper}>
      {/* 切换按钮 */}
      <button
        className={styles.toggleBtn}
        onClick={onToggle}
        title={open ? "收起属性面板" : "展开属性面板"}
      >
        <span className={styles.toggleBtnLabel}>属性</span>
      </button>

      <Drawer
        placement="right"
        open={open}
        onClose={onToggle}
        mask={false}
        getContainer={false}
        title={null}
        closable={false}
        push={false}
        styles={{
          wrapper: { width: 320, height: "100%" },
          body: { padding: 0, background: "#fafbfc" },
          header: {
            padding: 0,
            minHeight: 0,
            background: "#fafbfc",
            borderBottom: "none",
          },
          content: { height: "100%" },
        }}
        rootStyle={{ position: "static", width: open ? 320 : 0, height: "100%", overflow: "hidden", transition: "width 0.25s ease" }}
      >
        <PropertyPanel
          selectedViewId={selectedViewId}
          actions={actions}
          pages={pages}
          currentPageId={currentPageId}
          canvasSize={canvasSize}
          onCanvasSizeChange={onCanvasSizeChange}
          FlowEditorModal={FlowEditorModal}
          appId={appId}
          appSelected={appSelected}
        />
      </Drawer>
    </div>
  );
};

export default PropertyDrawer;
