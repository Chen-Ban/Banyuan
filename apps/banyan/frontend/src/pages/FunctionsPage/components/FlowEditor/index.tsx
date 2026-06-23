/**
 * FlowEditor — 云函数流程编辑器
 *
 * 布局：
 *   ┌──────────────────────────────────┐
 *   │  全屏画布（canvasArea 填满）       │
 *   │  ┌─┐                             │
 *   │  │◎│ ← 物料触发按钮（左上浮层）     │
 *   │  └─┘                             │
 *   │  ← Drawer（UnifiedMaterialPanel） │
 *   └──────────────────────────────────┘
 *
 * 职责：
 *   - 加载并编辑 FlowSchema（流程图画布）
 *   - 通过 Drawer + UnifiedMaterialPanel 提供节点物料拖拽
 *   - 暴露 save handle 给父组件（序列化 schema 并保存）
 *   - 函数名/显示名的编辑已移至 FunctionList（EditableListItem），此处不再管理
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { App, Drawer, Tooltip } from "antd";
import { AppstoreOutlined } from "@ant-design/icons";
import type { ExtractedFlowSchema } from "@/components/FlowKit/extractSchema";
import useFlowBanvas from "@/hooks/useFlowBanvas";
import { FlowContextMenu } from "@/components/FlowKit/FlowContextMenu";
import FlowNodePropertyPanel from "@/components/FlowKit/FlowNodePropertyPanel";
import UnifiedMaterialPanel from "@/components/UnifiedMaterialPanel";
import { cloudFunctionApi } from "@/api";
import type { CloudFunctionDef } from "@/api";
import styles from "./index.module.scss";

export interface FlowEditorProps {
  fn: CloudFunctionDef;
  appId: string;
  onSaved: (updated: CloudFunctionDef) => void;
  dirty: boolean;
  onDirtyChange: (dirty: boolean) => void;
}

export interface FlowEditorHandle {
  save: () => Promise<void>;
}

const FlowEditor = forwardRef<FlowEditorHandle, FlowEditorProps>(
  ({ fn, appId, onSaved, onDirtyChange }, ref) => {
    const { message } = App.useApp();
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);

    const containerRef = useCallback((el: HTMLDivElement | null) => {
      setContainerEl(el);
    }, []);

    const initialSchema = useMemo<ExtractedFlowSchema>(
      () => (fn.schema as ExtractedFlowSchema) ?? { version: '2.0.0', entry: '', nodes: {}, layout: {} },
      [fn],
    );

    const { Canvas, getSchema, selectedNode, updateNodeSchema, contextMenuState } = useFlowBanvas(
      {
        // 自适应模式：不传 width/height，画布跟随外部容器尺寸自动调整
        backgroundColor: "white",
      },
      initialSchema,
    );

    // ── 属性面板状态 ──
    const [panelDismissed, setPanelDismissed] = useState(false);
    const prevNodeIdRef = useRef<string | null>(null);

    // 选中新节点时自动重新展示面板
    useEffect(() => {
      const nodeId = selectedNode?.id ?? null;
      if (nodeId !== prevNodeIdRef.current) {
        prevNodeIdRef.current = nodeId;
        if (nodeId) setPanelDismissed(false);
      }
    }, [selectedNode]);

    const handleSave = async () => {
      try {
        const schema = getSchema();
        const res = await cloudFunctionApi.updateFunction(
          appId,
          fn.functionId,
          {
            name: fn.name,
            displayName: fn.displayName,
            description: fn.description,
            schema: schema as ExtractedFlowSchema,
          },
        );
        if (res.data) {
          onSaved(res.data);
          onDirtyChange(false);
          message.success("保存成功");
        }
      } catch (err: unknown) {
        message.error(err instanceof Error ? err.message : "保存失败");
      }
    };

    // ── 暴露 save 给父组件（供 appEvents.onSaveApp 调用） ──
    useImperativeHandle(ref, () => ({ save: handleSave }));

    return (
      // 外层：12px 内边距，让画布与页面边缘保持间距
      <div className={styles.flowEditorOuter}>
        {/* 内层：画布自适应填满 padding 后的剩余空间 */}
        <div className={styles.flowEditor} ref={containerRef}>
          {/* 流程画布（自适应容器尺寸） */}
          {Canvas}

          {/* 物料面板触发按钮（浮层左上角） */}
          <Tooltip
            title={paletteOpen ? "收起物料" : "节点物料"}
            placement="right"
          >
            <button
              className={`${styles.paletteToggleBtn}${paletteOpen ? ` ${styles.paletteToggleBtnOpen}` : ""}`}
              onClick={() => setPaletteOpen((v) => !v)}
              aria-label="打开物料面板"
            >
              <AppstoreOutlined />
            </button>
          </Tooltip>

          {/* 物料抽屉（挂载在内层容器，从左侧弹出，不占画布空间） */}
          <Drawer
            open={paletteOpen}
            onClose={() => setPaletteOpen(false)}
            placement="left"
            size={260}
            mask={false}
            closable={false}
            classNames={{ body: styles.drawerBody }}
            getContainer={containerEl ?? false}
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
            <UnifiedMaterialPanel mode="server-flow" />
          </Drawer>

          {/* 右键菜单 */}
          <FlowContextMenu state={contextMenuState} />

          {/* 节点属性面板 */}
          {selectedNode && !panelDismissed && (
            <FlowNodePropertyPanel
              node={selectedNode}
              onChange={updateNodeSchema}
              onClose={() => setPanelDismissed(true)}
            />
          )}
        </div>
      </div>
    );
  },
);

FlowEditor.displayName = "FlowEditor";

export default FlowEditor;
