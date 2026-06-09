import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import { App, Button, Spin, Empty, Modal } from "antd";
import { cloudFunctionApi } from "@/api";
import type { CloudFunctionDef } from "@/api";
import { appEvents } from "@/utils/appEvents";
import { usePreviewServerCtx } from "@/layouts/ApplicationLayout/PreviewServerCtx";
import FunctionList from "./components/FunctionList";
import FlowEditor from "./components/FlowEditor";
import type { FlowEditorHandle } from "./components/FlowEditor";
import styles from "./index.module.scss";

const FunctionsPage: React.FC = () => {
  const { message } = App.useApp();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  void navigate; // layout 负责导航
  const { hotUpdate } = usePreviewServerCtx();

  const [functions, setFunctions] = useState<CloudFunctionDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [adding, setAdding] = useState(false);

  const flowEditorRef = useRef<FlowEditorHandle>(null);

  const handleDirtyChange = useCallback((d: boolean) => setDirty(d), []);

  // ── 订阅全局保存事件（ApplicationLayout 保存按钮触发） ─────────────────
  useEffect(() => {
    return appEvents.onSaveApp(async () => {
      if (flowEditorRef.current && dirty) {
        await flowEditorRef.current.save();
      }
    });
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
      const next = [res.data!, ...functions];
      setFunctions(next);
      setSelectedId(res.data.functionId);
      setAdding(false);
      // 新增函数后通知 Preview Server 热更新
      hotUpdate({ cloudFunctions: next });
    }
  };

  const handleDeleteFunction = async (functionId: string) => {
    await cloudFunctionApi.deleteFunction(id!, functionId);
    const next = functions.filter((f) => f.functionId !== functionId);
    setFunctions(next);
    setSelectedId((prev) => {
      if (prev !== functionId) return prev;
      return next.length > 0 ? next[0].functionId : null;
    });
    // 删除函数后通知 Preview Server 热更新
    hotUpdate({ cloudFunctions: next });
  };

  const handleRenameFunction = async (functionId: string, newName: string, newDisplayName: string) => {
    const res = await cloudFunctionApi.updateFunction(id!, functionId, {
      name: newName,
      displayName: newDisplayName,
    });
    if (res.data) {
      setFunctions((prev) =>
        prev.map((f) => (f.functionId === functionId ? res.data! : f)),
      );
    }
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
    setFunctions((prev) => {
      const next = prev.map((f) => (f.functionId === updated.functionId ? updated : f));
      // 保存成功后通知 Preview Server 热更新云函数
      hotUpdate({ cloudFunctions: next });
      return next;
    });
  }, [hotUpdate]);

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
            onRename={handleRenameFunction}
          />

          <div className={styles.flowEditorWrapper}>
            {selectedFunction ? (
              <FlowEditor
                ref={flowEditorRef}
                key={selectedFunction.functionId}
                fn={selectedFunction}
                appId={id}
                onSaved={handleSaved}
                dirty={dirty}
                onDirtyChange={handleDirtyChange}
              />
            ) : adding ? (
              <div className={styles.newFunctionHint}>
                <Empty
                  description="请在左侧输入函数名并创建，即可在此编辑流程"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
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
