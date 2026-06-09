import React, { useState } from "react";
import { App, Button, Input, Tooltip, Empty } from "antd";
import { PlusOutlined, ThunderboltOutlined } from "@ant-design/icons";
import type { CloudFunctionDef } from "@/api";
import EditableListItem from "@/components/EditableListItem";
import styles from "./index.module.scss";

export interface FunctionListProps {
  functions: CloudFunctionDef[];
  selectedId: string | null;
  adding: boolean;
  onStartAdd: () => void;
  onCancelAdd: () => void;
  onConfirmAdd: (name: string, displayName: string) => Promise<void>;
  onSelect: (functionId: string) => void;
  onDelete: (functionId: string) => Promise<void>;
  onRename: (functionId: string, name: string, displayName: string) => Promise<void>;
}

const FunctionList: React.FC<FunctionListProps> = ({
  functions,
  selectedId,
  adding,
  onStartAdd,
  onCancelAdd,
  onConfirmAdd,
  onSelect,
  onDelete,
  onRename,
}) => {
  const { message } = App.useApp();
  const [newName, setNewName] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await onConfirmAdd(trimmed, newDisplayName.trim() || trimmed);
      setNewName("");
      setNewDisplayName("");
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "创建失败");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setNewName("");
    setNewDisplayName("");
    onCancelAdd();
  };

  return (
    <div className={styles.functionList}>
      <div className={styles.functionListHeader}>
        <span className={styles.functionListTitle}>云函数</span>
        <Tooltip title="新建云函数">
          <Button
            type="text"
            size="small"
            icon={<PlusOutlined />}
            onClick={onStartAdd}
            className={styles.addBtn}
          />
        </Tooltip>
      </div>

      {/* 新建表单（顶部） */}
      {adding && (
        <div className={styles.addFunctionForm}>
          <Input
            size="small"
            placeholder="函数名（英文，如 submitOrder）"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
              if (e.key === "Escape") handleCancel();
            }}
            autoFocus
            disabled={saving}
          />
          <Input
            size="small"
            placeholder="显示名（可选）"
            value={newDisplayName}
            onChange={(e) => setNewDisplayName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
              if (e.key === "Escape") handleCancel();
            }}
            disabled={saving}
          />
          <div className={styles.addFunctionActions}>
            <Button size="small" onClick={handleCancel} disabled={saving}>
              取消
            </Button>
            <Button
              size="small"
              type="primary"
              onClick={handleAdd}
              loading={saving}
              disabled={!newName.trim()}
            >
              创建
            </Button>
          </div>
        </div>
      )}

      <div className={styles.functionItems}>
        {functions.map((fn) => (
          <EditableListItem
            key={fn.functionId}
            icon={<ThunderboltOutlined />}
            name={fn.name}
            displayName={fn.displayName}
            selected={selectedId === fn.functionId}
            editable
            nameEditable
            onSelect={() => onSelect(fn.functionId)}
            onRename={(newName, newDisplayName) => onRename(fn.functionId, newName, newDisplayName)}
            onDelete={() => onDelete(fn.functionId)}
            deleteTitle={`删除云函数 "${fn.displayName}"？`}
            deleteDescription="此操作不可恢复。"
          />
        ))}

        {functions.length === 0 && !adding && (
          <Empty
            className={styles.functionEmpty}
            description="暂无云函数"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        )}
      </div>
    </div>
  );
};

export default FunctionList;
