import React, { useEffect, useMemo, useState } from "react";
import { Button, Input, message } from "antd";
import { SaveOutlined } from "@ant-design/icons";
import type { FlowSchema } from "@banyuan/banyan-sdk";
import { useFlowBanvas, FlowContextMenu } from "@banyuan/banyan-sdk";
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

const FlowEditor: React.FC<FlowEditorProps> = ({
  fn,
  appId,
  onSaved,
  dirty,
  onDirtyChange,
}) => {
  // 逻辑尺寸固定，容器适配由 hook 内部自测量
  const CANVAS_WIDTH = 1200;
  const CANVAS_HEIGHT = 720;
  const [localName, setLocalName] = useState(fn.name);
  const [localDisplayName, setLocalDisplayName] = useState(fn.displayName);
  const [localDescription, setLocalDescription] = useState(fn.description);
  const [saving, setSaving] = useState(false);
  const [schemaDirty, setSchemaDirty] = useState(false);

  const initialSchema = useMemo<FlowSchema>(
    () => (fn.schema as FlowSchema) ?? { nodes: [], edges: [] },
    [fn],
  );

  // 直接使用 hook —— 返回 Canvas 元素 + schema + MaterialPalette + contextMenuState
  const { Canvas, app, schema, MaterialPalette, contextMenuState } = useFlowBanvas(
    {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      backgroundColor: "transparent",
    },
    initialSchema,
    "server",
  );

  // dirty 检测（元信息部分）
  const metaDirty =
    localName !== fn.name ||
    localDisplayName !== fn.displayName ||
    localDescription !== fn.description;

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
        description: localDescription.trim(),
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

  return (
    <div className={styles.flowEditor}>
      {/* 头部：函数信息 + 保存按钮 */}
      <div className={styles.flowEditorHeader}>
        <div className={styles.flowEditorMeta}>
          <Input
            size="small"
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            placeholder="函数名（英文）"
            className={styles.metaNameInput}
            addonBefore="name"
          />
          <Input
            size="small"
            value={localDisplayName}
            onChange={(e) => setLocalDisplayName(e.target.value)}
            placeholder="显示名"
            className={styles.metaDisplayInput}
            addonBefore="显示名"
          />
          <Input
            size="small"
            value={localDescription}
            onChange={(e) => setLocalDescription(e.target.value)}
            placeholder="描述（可选）"
            className={styles.metaDescInput}
            addonBefore="描述"
          />
        </div>
        <Button
          type="primary"
          size="small"
          icon={<SaveOutlined />}
          onClick={handleSave}
          loading={saving}
          disabled={!dirty}
        >
          保存
        </Button>
      </div>

      {/* 节点物料面板（使用 hook 提供的默认 UI） */}
      <div className={styles.paletteArea}>
        <MaterialPalette />
      </div>

      {/* 流程画布 */}
      <div className={styles.canvasArea}>
        {Canvas}
      </div>

      {/* 右键菜单 */}
      <FlowContextMenu state={contextMenuState} />
    </div>
  );
};

export default FlowEditor;
