import React from "react";
import { Drawer, Tooltip } from "antd";
import { PropertyPanel } from "@/components/DesignEditor/PropertyPanel";
import { FlowEditorModal } from "@/components/FlowEditor/FlowEditorModal";
import { SettingOutlined } from "@ant-design/icons";
import type useDesignBanvas from "@/hooks/useDesignBanvas";
import styles from "./index.module.scss";

type DesignBanvasReturn = ReturnType<typeof useDesignBanvas>;

export interface PropertyDrawerProps {
  open: boolean;
  onToggle: () => void;
  container: HTMLDivElement | null;
  selectedViewId: string;
  actions: DesignBanvasReturn["actions"];
  currentPageId: string;
  canvasSize: { width: number; height: number };
  onCanvasSizeChange: (width: number, height: number) => void;
  appId?: string;
}

const PropertyDrawer: React.FC<PropertyDrawerProps> = ({
  open,
  onToggle,
  container,
  selectedViewId,
  actions,
  currentPageId,
  canvasSize,
  onCanvasSizeChange,
  appId,
}) => {
  return (
    <>
      {/* 触发按钮：fix 在画布右上角，抽屉打开时向左偏移 */}
      <Tooltip title={open ? "收起属性" : "属性面板"} placement="left">
        <button
          className={`${styles.toggleBtn}${open ? ` ${styles.toggleBtnOpen}` : ""}`}
          onClick={onToggle}
          aria-label="属性面板"
        >
          <SettingOutlined />
        </button>
      </Tooltip>

      <Drawer
        placement="right"
        open={open}
        onClose={onToggle}
        mask={false}
        closable={false}
        getContainer={container ?? false}
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
            // 卡片效果：距容器四边 12px，圆角，淡边框
            top: 12,
            bottom: 12,
            right: 12,
            height: "calc(100% - 24px)",
            borderRadius: 12,
            border: "1px solid rgba(255, 255, 255, 0.1)",
            overflow: "hidden",
            boxShadow: "0 8px 32px rgba(0,0,0,0.55)",
          },
          body: { padding: 0, background: "#16161e", overflowY: "auto" },
        }}
        width={300}
        push={false}
      >
        <PropertyPanel
          selectedViewId={selectedViewId}
          actions={actions}
          currentPageId={currentPageId}
          canvasSize={canvasSize}
          onCanvasSizeChange={onCanvasSizeChange}
          FlowEditorModal={FlowEditorModal}
          appId={appId}
        />
      </Drawer>
    </>
  );
};

export default PropertyDrawer;
