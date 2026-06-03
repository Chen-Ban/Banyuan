/**
 * UIPage — 画布子页面
 *
 * 布局：
 *   ┌──────────────────────────────┐
 *   │  上段：物料面板（ComponentPalette）│
 *   ├──────────────────────────────┤
 *   │  中段：画布（Banvas）          │
 *   ├──────────────────────────────┤
 *   │  （PropertyDrawer 浮层）       │
 *   └──────────────────────────────┘
 *
 * 职责：
 *   - 加载应用的初始 appJSON 数据，初始化 useDesignBanvas
 *   - 渲染物料面板、画布、PropertyDrawer
 *   - 通过 AppLayoutCtx.registerGetApp 向 ApplicationLayout 注册序列化函数（供 handleBuild 使用）
 *   - 订阅 appEvents.saveApp 事件：序列化当前 appJSON 并调用 API 保存
 *   - 通过 RootLayoutCtx.registerAiCallbacks 向 AiBar 注册 onDone / onAppSnapshot
 *   - 通过 RootLayoutCtx.aiBarHandle 触发 sendPrompt（首页跳转后自动起始对话）
 */

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useParams, useLocation } from "react-router-dom";
import useDesignBanvas from "@/hooks/useDesignBanvas";
import { DesignContextMenu } from "@/components/DesignEditor/DesignContextMenu";
import { App, Tooltip } from "antd";
import { AppstoreOutlined } from "@ant-design/icons";
import { applicationApi } from "@/api";
import { getErrorMessage } from "@/utils/error";
import { appEvents } from "@/utils/appEvents";
import { useAppLayoutCtx } from "@/layouts/ApplicationLayout/AppLayoutCtx";
import { useRootLayoutCtx } from "@/layouts/RootLayout/RootLayoutCtx";
import ComponentPalette from "./components/ComponentPalette";
import PropertyDrawer from "./components/PropertyDrawer";
import SaveMaterialModal from "@/components/SaveMaterialModal";
import MaterialPanel from "@/components/MaterialPanel";
import styles from "./index.module.scss";

const UIPage = () => {
  const { message } = App.useApp();
  const { id: application_id } = useParams<{ id: string }>();
  const location = useLocation();
  const { registerGetApp, unregisterGetApp } = useAppLayoutCtx();
  const { registerAiCallbacks, unregisterAiCallbacks, aiBarHandle } = useRootLayoutCtx();

  // 首页跳转时携带的初始 prompt，画布加载完成后自动发送。
  // 优先从 sessionStorage 读取（跨 ProtectedRoute 重挂载 / StrictMode 双挂载稳定存活），
  // location.state 仅作兜底。
  // 注意：此处只「读」不「删」。StrictMode 在 dev 下会卸载并重挂载组件（产生全新实例与
  // 全新 ref），若在 ref 初始化阶段就 removeItem，throwaway 挂载会把值删掉而其 ref 被丢弃，
  // 真正的挂载将读不到。因此删除动作推迟到「确实派发 sendPrompt 之后」执行。
  const sessionKey = application_id ? `banyan:initialPrompt:${application_id}` : null;
  const initialPromptRef = useRef<string | null>(
    (() => {
      let stored: string | null = null;
      if (sessionKey) {
        try {
          stored = sessionStorage.getItem(sessionKey);
        } catch {
          /* 忽略 storage 访问异常 */
        }
      }
      const fromState =
        (location.state as { initialPrompt?: string } | null)?.initialPrompt ?? null;
      return stored ?? fromState;
    })(),
  );
  // 标记是否已真正派发，保证只发送一次（不提前置空 initialPromptRef，避免误消费）
  const promptSentRef = useRef(false);

  const [appJSON, setAppJSON] = useState<string>('');
  const [loaded, setLoaded] = useState(false);
  const needsThumbnailRef = useRef(false);

  // canvasSection 容器，作为两个抽屉的挂载容器（仅覆盖画布区域）
  const [canvasSectionEl, setCanvasSectionEl] = useState<HTMLDivElement | null>(null);
  const canvasSectionRef = useCallback((el: HTMLDivElement | null) => {
    setCanvasSectionEl(el);
  }, []);

  // ── 加载应用初始 appJSON ────────────────────────────────────────────────────
  useEffect(() => {
    if (!application_id) return;
    applicationApi
      .fetchApplication(application_id)
      .then((res) => {
        const application = res.data!;
        setAppJSON(application.appJSON || '');
        needsThumbnailRef.current = !application.thumbnail;
        setLoaded(true);
      })
      .catch((err: unknown) => {
        message.error(getErrorMessage(err));
        setLoaded(true);
      });
  }, [application_id]);

  const [canvasSize, setCanvasSize] = useState({ width: 1280, height: 800 });
  const [rightOpen, setRightOpen] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const prevSelectedViewIdRef = useRef<string>("");

  // ── 保存为物料弹窗状态 ─────────────────────────────────────────────────────
  const [saveMaterialOpen, setSaveMaterialOpen] = useState(false);
  const [saveMaterialViewId, setSaveMaterialViewId] = useState("");

  const handleCanvasSizeChange = useCallback(
    (width: number, height: number) => {
      setCanvasSize({ width, height });
    },
    [],
  );

  const banvasOptions = useMemo(
    () => ({
      width: canvasSize.width,
      height: canvasSize.height,
      appOptions: {
        enablePageStack: true,
        maxPageStackSize: 50,
      },
      rendererOptions: {
        clearColor: "#fff",
      },
    }),
    [canvasSize.width, canvasSize.height],
  );

  const {
    Banvas,
    currentPageId,
    selectedViewId,
    actions,
    contextMenu: rawContextMenu,
  } = useDesignBanvas(loaded ? appJSON : '', banvasOptions);

  // ── 扩展右键菜单：为视图添加"保存为物料"选项 ─────────────────────────────────
  const contextMenu = useMemo(() => {
    if (!rawContextMenu.visible || rawContextMenu.target !== 'view' || !rawContextMenu.viewId) {
      return rawContextMenu
    }
    const viewId = rawContextMenu.viewId
    return {
      ...rawContextMenu,
      items: [
        ...rawContextMenu.items,
        {
          key: 'saveMaterial',
          label: '保存为物料',
          divider: true,
          handler: () => {
            setSaveMaterialViewId(viewId)
            setSaveMaterialOpen(true)
          },
        },
      ],
    }
  }, [rawContextMenu]);

  // ── 向 ApplicationLayout 注册 getApp（供 handleBuild 序列化） ───────────
  useEffect(() => {
    registerGetApp(() => actions.app.getSerializedApp());
    return () => unregisterGetApp();
  }, [registerGetApp, unregisterGetApp, actions]);

  // ── 订阅 saveApp 事件：序列化 appJSON 并调用 API 保存 ───────────────────────
  // 发布方：ApplicationLayout 保存按钮 / AiBar onBeforeSend
  useEffect(() => {
    if (!application_id) return;
    const unsubscribe = appEvents.onSaveApp(async () => {
      const serialized = actions.app.getSerializedApp();
      await applicationApi.updateApplication(application_id, { appJSON: serialized });
    });
    return unsubscribe;
  }, [application_id, actions]);

  // ── 向 AiBar 注册画布回调（onDone / onAppSnapshot） ────────────────────
  useEffect(() => {
    registerAiCallbacks({
      onDone: (json) => setAppJSON(json),
      onAppSnapshot: (json) => setAppJSON(json),
    });
    return () => unregisterAiCallbacks();
  }, [registerAiCallbacks, unregisterAiCallbacks]);

  useEffect(() => {
    if (selectedViewId !== "") {
      setRightOpen(true);
    } else if (prevSelectedViewIdRef.current === "") {
      setRightOpen(false);
    }
    prevSelectedViewIdRef.current = selectedViewId;
  }, [selectedViewId]);

  // ── 首页跳转后自动发送 initialPrompt ─────────────────────────────────────
  // 触发条件：loaded 为 true（appJSON 已就绪）且 aiBarHandle 已绑定（AiBar 已挂载）。
  //
  // 这两个就绪信号来自相互独立的子树：
  //   - loaded   ← UIPage 自己 fetchApplication 完成
  //   - aiBarHandle ← RootLayout 渲染 AiBar 后经 handleAiBarRef 异步回填的 context
  // 二者谁先到达不确定，因此用 effect 依赖 [loaded, aiBarHandle] 等两者皆就绪时再发送。
  //
  // 关键改动（修复「必须刷新才自动发送」）：
  //   1. 不再用 requestAnimationFrame：rAF 回调会在 effect cleanup（依赖变化 / StrictMode
  //      双挂载）时被 cancelAnimationFrame 取消，而此前已把 prompt 置空，导致 prompt 被
  //      「消费却未发送」，只能靠刷新（重新读 location.state）恢复 —— 这正是 bug 根因。
  //   2. 改为同步派发，并用独立的 promptSentRef 作为「已发送」标记，只有真正调用
  //      sendPrompt 之后才置位，绝不提前清空 initialPromptRef。
  useEffect(() => {
    if (promptSentRef.current) return; // 已发送过，幂等
    if (!loaded) return;
    if (!aiBarHandle) return; // handle 尚未绑定，等待下一次依赖变化重跑
    const prompt = initialPromptRef.current;
    if (!prompt) return;
    promptSentRef.current = true; // 先置位，保证同步派发只发一次
    aiBarHandle.sendPrompt(prompt);
    // 派发成功后再清除 sessionStorage 暂存，避免刷新时重复自动发送
    if (sessionKey) {
      try {
        sessionStorage.removeItem(sessionKey);
      } catch {
        /* 忽略 storage 访问异常 */
      }
    }
  }, [loaded, aiBarHandle, sessionKey]);

  // ── 自动生成缩略图 ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!loaded || !application_id || !needsThumbnailRef.current) return;
    if (!appJSON) return;
    const timer = setTimeout(() => {
      if (!needsThumbnailRef.current) return;
      needsThumbnailRef.current = false;
      const dataUrl = actions.app.exportImage("image/png");
      if (!dataUrl) return;
      fetch(dataUrl)
        .then((res) => res.blob())
        .then((blob) => applicationApi.uploadThumbnail(application_id, blob))
        .catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [loaded, application_id, actions, appJSON]);

  if (!loaded) {
    return <div style={{ padding: 40, textAlign: "center" }}>加载中...</div>;
  }

  return (
    <div className={styles.page}>
      {/* ── 画布区域：物料 + 画布 + PropertyDrawer ── */}
      <div className={styles.mainContent}>
        <div className={styles.canvasSection} ref={canvasSectionRef}>
          {/* 画布（Banvas 内部已有 div 包裹） */}
          {Banvas}

          {/* 物料面板触发按钮（overlay 在画布左上角，抽屉打开时向右偏移） */}
          <Tooltip title={paletteOpen ? '收起组件' : '组件物料'} placement="right">
            <button
              className={`${styles.paletteToggleBtn}${paletteOpen ? ` ${styles.paletteToggleBtnOpen}` : ''}`}
              onClick={() => setPaletteOpen((v) => !v)}
              aria-label="打开组件面板"
            >
              <AppstoreOutlined />
            </button>
          </Tooltip>

          {/* 物料抽屉（挂载在 canvasSection，从左侧弹出，不占画布空间） */}
          <ComponentPalette
            open={paletteOpen}
            onClose={() => setPaletteOpen(false)}
            container={canvasSectionEl}
          />

          {/* 属性面板（挂载在 canvasSection，从右侧弹出，不占画布空间） */}
          <PropertyDrawer
            open={rightOpen}
            onToggle={() => setRightOpen((v) => !v)}
            container={canvasSectionEl}
            selectedViewId={selectedViewId}
            actions={actions}
            currentPageId={currentPageId || ""}
            canvasSize={canvasSize}
            onCanvasSizeChange={handleCanvasSizeChange}
            appId={application_id}
          />
        </div>
      </div>

      <DesignContextMenu state={contextMenu} />

      {/* ── 保存为物料弹窗 ── */}
      <SaveMaterialModal
        open={saveMaterialOpen}
        onClose={() => setSaveMaterialOpen(false)}
        viewId={saveMaterialViewId}
        actions={actions}
      />
    </div>
  );
};

export default UIPage;
