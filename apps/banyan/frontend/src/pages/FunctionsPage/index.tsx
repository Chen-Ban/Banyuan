import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useNavigate, useBlocker } from "react-router-dom";
import {
  Button,
  Input,
  Spin,
  Popconfirm,
  message,
  Tooltip,
  Empty,
  Modal,
} from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  SaveOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import type { FlowSchema } from "@banyuan/banyan-sdk";
import { useFlowBanvas } from "@banyuan/banyan-sdk";
import { cloudFunctionApi } from "@/api";
import type { CloudFunctionDef } from "@/api";
import styles from "./index.module.scss";

// ── 左侧：云函数列表 ─────────────────────────────────────────────────────────

interface FunctionListProps {
  functions: CloudFunctionDef[];
  selectedId: string | null;
  adding: boolean;
  onStartAdd: () => void;
  onCancelAdd: () => void;
  onConfirmAdd: (name: string, displayName: string) => Promise<void>;
  onSelect: (functionId: string) => void;
  onDelete: (functionId: string) => Promise<void>;
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
}) => {
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
          <div
            key={fn.functionId}
            className={`${styles.functionItem} ${selectedId === fn.functionId ? styles.functionItemActive : ""}`}
            onClick={() => onSelect(fn.functionId)}
          >
            <ThunderboltOutlined className={styles.functionItemIcon} />
            <div className={styles.functionItemInfo}>
              <span className={styles.functionItemDisplay}>
                {fn.displayName}
              </span>
              <span className={styles.functionItemName}>{fn.name}</span>
            </div>
            <Popconfirm
              title={`删除云函数 "${fn.displayName}"？`}
              description="此操作不可恢复。"
              onConfirm={(e) => {
                e?.stopPropagation();
                onDelete(fn.functionId);
              }}
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <span
                className={styles.functionDeleteBtn}
                onClick={(e) => e.stopPropagation()}
              >
                <DeleteOutlined />
              </span>
            </Popconfirm>
          </div>
        ))}

        {functions.length === 0 && !adding && (
          <div className={styles.functionEmpty}>暂无云函数</div>
        )}
      </div>
    </div>
  );
};

// ── 右侧：Flow 编辑器 ────────────────────────────────────────────────────────

interface FlowEditorProps {
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
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 600, height: 360 });
  const [localName, setLocalName] = useState(fn.name);
  const [localDisplayName, setLocalDisplayName] = useState(fn.displayName);
  const [localDescription, setLocalDescription] = useState(fn.description);
  const [saving, setSaving] = useState(false);
  const [schemaDirty, setSchemaDirty] = useState(false);

  // 自适应容器尺寸
  useEffect(() => {
    const el = canvasWrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setCanvasSize({ width: Math.floor(width), height: Math.floor(height) });
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const initialSchema = useMemo<FlowSchema>(
    () => (fn.schema as FlowSchema) ?? { nodes: [], edges: [] },
    [fn],
  );

  // 直接使用 hook —— 返回 Canvas 元素 + schema + MaterialPalette
  const { Canvas, app, schema, MaterialPalette } = useFlowBanvas(
    { width: canvasSize.width, height: canvasSize.height, backgroundColor: "transparent" },
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
      <div ref={canvasWrapperRef} className={styles.canvasArea}>
        {Canvas}
      </div>
    </div>
  );
};

// ── FunctionsPage 主组件 ──────────────────────────────────────────────────────

const FunctionsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  void navigate; // layout 负责导航

  const [functions, setFunctions] = useState<CloudFunctionDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [adding, setAdding] = useState(false);

  const handleDirtyChange = useCallback((d: boolean) => setDirty(d), []);

  // ── 路由离开拦截 ─────────────────────────────────────────────────────────

  const blocker = useBlocker(dirty);

  useEffect(() => {
    if (blocker.state === "blocked") {
      Modal.confirm({
        title: "有未保存的更改",
        content: "当前云函数修改尚未保存，确定要离开吗？未保存的更改将丢失。",
        okText: "离开",
        cancelText: "留在此页",
        okButtonProps: { danger: true },
        onOk: () => blocker.proceed(),
        onCancel: () => blocker.reset(),
      });
    }
  }, [blocker]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // ── 加载云函数列表 ───────────────────────────────────────────────────────

  const loadFunctions = useCallback(async () => {
    if (!id || id === "new") return;
    setLoading(true);
    try {
      const res = await cloudFunctionApi.listFunctions(id);
      const fns = res.data ?? [];
      setFunctions(fns);
      if (fns.length > 0 && !selectedId) {
        setSelectedId(fns[0].functionId);
      }
    } catch {
      message.error("加载云函数失败");
    } finally {
      setLoading(false);
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadFunctions();
  }, [loadFunctions]);

  // ── CRUD 操作 ────────────────────────────────────────────────────────────

  const handleStartAdd = () => {
    setAdding(true);
    setSelectedId(null);
  };

  const handleCancelAdd = () => {
    setAdding(false);
    if (functions.length > 0) setSelectedId(functions[0].functionId);
  };

  const handleConfirmAdd = async (name: string, displayName: string) => {
    const res = await cloudFunctionApi.createFunction(id!, {
      name,
      displayName,
    });
    if (res.data) {
      setFunctions((prev) => [res.data!, ...prev]);
      setSelectedId(res.data.functionId);
      setAdding(false);
    }
  };

  const handleDeleteFunction = async (functionId: string) => {
    await cloudFunctionApi.deleteFunction(id!, functionId);
    setFunctions((prev) => prev.filter((f) => f.functionId !== functionId));
    setSelectedId((prev) => {
      if (prev !== functionId) return prev;
      const remaining = functions.filter((f) => f.functionId !== functionId);
      return remaining.length > 0 ? remaining[0].functionId : null;
    });
  };

  // ── 切换函数时检查 dirty ─────────────────────────────────────────────────

  const pendingSwitchRef = useRef<string | null>(null);

  const handleSelectFunction = (functionId: string) => {
    if (functionId === selectedId) return;
    if (dirty) {
      pendingSwitchRef.current = functionId;
      Modal.confirm({
        title: "有未保存的更改",
        content: "切换云函数前请先保存，否则当前修改将丢失。",
        okText: "放弃更改并切换",
        cancelText: "取消",
        okButtonProps: { danger: true },
        onOk: () => {
          setDirty(false);
          setSelectedId(pendingSwitchRef.current);
          pendingSwitchRef.current = null;
        },
        onCancel: () => {
          pendingSwitchRef.current = null;
        },
      });
    } else {
      setSelectedId(functionId);
    }
  };

  const handleSaved = useCallback((updated: CloudFunctionDef) => {
    setFunctions((prev) =>
      prev.map((f) => (f.functionId === updated.functionId ? updated : f)),
    );
  }, []);

  const selectedFunction = useMemo(
    () => functions.find((f) => f.functionId === selectedId) ?? null,
    [functions, selectedId],
  );

  if (!id || id === "new") {
    return (
      <div className={styles.emptyPage}>
        <p>请先保存应用后再管理云函数。</p>
        <Button onClick={() => navigate(-1)}>返回</Button>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* dirty 提示条 */}
      {dirty && (
        <div className={styles.dirtyBar}>
          <span className={styles.dirtyBadge}>未保存</span>
        </div>
      )}

      {/* 主体 */}
      {loading ? (
        <div className={styles.loadingWrapper}>
          <Spin size="large" />
        </div>
      ) : (
        <div className={styles.body}>
          <FunctionList
            functions={functions}
            selectedId={selectedId}
            adding={adding}
            onStartAdd={handleStartAdd}
            onCancelAdd={handleCancelAdd}
            onConfirmAdd={handleConfirmAdd}
            onSelect={handleSelectFunction}
            onDelete={handleDeleteFunction}
          />

          <div className={styles.flowEditorWrapper}>
            {selectedFunction ? (
              <FlowEditor
                key={selectedFunction.functionId}
                fn={selectedFunction}
                appId={id}
                onSaved={handleSaved}
                dirty={dirty}
                onDirtyChange={handleDirtyChange}
              />
            ) : adding ? (
              <div className={styles.flowEditor}>
                <div className={styles.flowEditorHeader}>
                  <div className={styles.flowEditorMeta}>
                    <span className={styles.newFunctionHintTitle}>
                      新建云函数
                    </span>
                  </div>
                </div>
                <div className={styles.newFunctionHint}>
                  <Empty
                    description="请在左侧输入函数名并创建，即可在此编辑流程"
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                  />
                </div>
              </div>
            ) : (
              <div className={styles.noSelection}>
                <Empty
                  description="请在左侧选择或新建一个云函数"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FunctionsPage;
