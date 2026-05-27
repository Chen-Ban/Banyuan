import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Input, Space, message } from "antd";
import type { FlowSchema } from "@banyuan/banyan-sdk";
import {
  useFlowBanvas,
  FlowContextMenu,
  NodeSchemaPopover,
} from "@banyuan/banyan-sdk";
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

const FlowEditor = forwardRef<FlowEditorHandle, FlowEditorProps>(({
  fn,
  appId,
  onSaved,
  dirty,
  onDirtyChange,
}, ref) => {
  // 逻辑尺寸固定，容器适配由 hook 内部自测量
  const CANVAS_WIDTH = 1200;
  const CANVAS_HEIGHT = 720;
  const [localName, setLocalName] = useState(fn.name);
  const [localDisplayName, setLocalDisplayName] = useState(fn.displayName);
  const [saving, setSaving] = useState(false);
  const [schemaDirty, setSchemaDirty] = useState(false);

  const initialSchema = useMemo<FlowSchema>(
    () => (fn.schema as FlowSchema) ?? { nodes: [], edges: [] },
    [fn],
  );

  // 直接使用 hook —— 返回 Canvas 元素 + schema + MaterialPalette + contextMenuState
  const {
    Canvas,
    app,
    schema,
    canvasRef,
    selectedNode,
    selectedNodePos,
    MaterialPalette,
    contextMenuState,
  } = useFlowBanvas(
    {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      backgroundColor: "transparent",
    },
    initialSchema,
    "server",
  );

  // ── 节点属性浮层开关（对齐 FlowEditorModal 的做法） ──
  const [popoverOpen, setPopoverOpen] = useState(false);
  const prevSelectedNodeIdRef = useRef<string | null>(null);
  const currentNodeId = selectedNode?.id ?? null;

  if (currentNodeId !== prevSelectedNodeIdRef.current) {
    prevSelectedNodeIdRef.current = currentNodeId;
    if (currentNodeId !== null && !popoverOpen) {
      Promise.resolve().then(() => setPopoverOpen(true));
    } else if (currentNodeId === null) {
      Promise.resolve().then(() => setPopoverOpen(false));
    }
  }

  const handleClosePopover = useCallback(() => setPopoverOpen(false), []);

  // canvas 的 DOMRect（Popover 定位用）
  const canvasRect = canvasRef.current
    ? canvasRef.current.getBoundingClientRect()
    : null;

  // dirty 检测（元信息部分）
  const metaDirty =
    localName !== fn.name || localDisplayName !== fn.displayName;

  useEffect(() => {
    onDirtyChange(metaDirty || schemaDirty);
  }, [metaDirty, schemaDirty, onDirtyChange]);

  // 监听画布 version 变化 → 标记 schema dirty
  useEffect(() => {
    if (!app) return;
    const unsubscribe = app.subscribe(() => {
      setSchemaDirty(true);
    });
    return unsubscribe;
  }, [app]);

  const handleSave = async () => {
    if (!localName.trim()) {
      message.error("函数名不能为空");
      return;
    }

    setSaving(true);
    try {
      const res = await cloudFunctionApi.updateFunction(appId, fn.functionId, {
        name: localName.trim(),
        displayName: localDisplayName.trim() || localName.trim(),
        description: fn.description,
        schema: schema as { nodes: unknown[]; edges: unknown[] },
      });
      if (res.data) {
        onSaved(res.data);
        onDirtyChange(false);
        setSchemaDirty(false);
        message.success("保存成功");
      }
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  // ── 暴露 save 给父组件（供 appEvents.onSaveApp 调用） ──────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useImperativeHandle(ref, () => ({ save: handleSave }));

  return (
    <div className={styles.flowEditor}>
      {/* 头部：函数信息 + 保存按钮 */}
      <div className={styles.flowEditorHeader}>
        <div className={styles.flowEditorMeta}>
          <Space.Compact size="small" className={styles.metaNameInput}>
            <Input style={{ width: 60, flexShrink: 0 }} defaultValue="name" readOnly />
            <Input
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              placeholder="函数名（英文）"
            />
          </Space.Compact>
          <Space.Compact size="small" className={styles.metaDisplayInput}>
            <Input style={{ width: 60, flexShrink: 0 }} defaultValue="显示名" readOnly />
            <Input
              value={localDisplayName}
              onChange={(e) => setLocalDisplayName(e.target.value)}
              placeholder="显示名"
            />
          </Space.Compact>
        </div>
      </div>

      {/* 节点物料面板（使用 hook 提供的默认 UI） */}
      <div className={styles.paletteArea}>
        <MaterialPalette />
      </div>

      {/* 流程画布 */}
      <div className={styles.canvasArea}>{Canvas}</div>

      {/* 右键菜单 */}
      <FlowContextMenu state={contextMenuState} />

      {/* 节点属性浮层 */}
      {popoverOpen && selectedNode && selectedNodePos && (
        <NodeSchemaPopover
          node={selectedNode}
          nodePos={selectedNodePos}
          canvasRect={canvasRect}
          onClose={handleClosePopover}
        />
      )}
    </div>
  );
});

FlowEditor.displayName = 'FlowEditor';

export default FlowEditor;
