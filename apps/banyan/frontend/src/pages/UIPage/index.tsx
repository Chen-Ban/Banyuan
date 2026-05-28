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
 *   - 加载应用的初始 pages 数据，初始化 useDesignBanvas
 *   - 渲染物料面板、画布、PropertyDrawer
 *   - 通过 AppLayoutCtx.registerGetPages 向 ApplicationLayout 注册序列化函数（供 handleBuild 使用）
 *   - 订阅 appEvents.saveApp 事件：序列化当前 pages 并调用 API 保存
 *   - 通过 RootLayoutCtx.registerAiCallbacks 向 AiBar 注册 onDone / onPagesSnapshot
 *   - 通过 RootLayoutCtx.aiBarHandle 触发 sendPrompt（首页跳转后自动起始对话）
 */

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useParams, useLocation } from "react-router-dom";
import useDesignBanvas from "@/hooks/design/useDesignBanvas";
import { DesignContextMenu } from "@/components/DesignEditor/DesignContextMenu";
import { message, Tooltip } from "antd";
import { AppstoreOutlined } from "@ant-design/icons";
import { applicationApi } from "@/api";
import { getErrorMessage } from "@/utils/error";
import { appEvents } from "@/utils/appEvents";
import { useAppLayoutCtx } from "@/layouts/ApplicationLayout/AppLayoutCtx";
import { useRootLayoutCtx } from "@/layouts/RootLayout/RootLayoutCtx";
import ComponentPalette from "./components/ComponentPalette";
import PropertyDrawer from "./components/PropertyDrawer";
import styles from "./index.module.scss";

const UIPage = () => {
  const { id: application_id } = useParams<{ id: string }>();
  const location = useLocation();
  const { registerGetPages, unregisterGetPages } = useAppLayoutCtx();
  const { registerAiCallbacks, unregisterAiCallbacks, aiBarHandle } = useRootLayoutCtx();

  // 首页跳转时携带的初始 prompt，画布加载完成后自动发送
  const initialPromptRef = useRef<string | null>(
    (location.state as { initialPrompt?: string } | null)?.initialPrompt ?? null,
  );

  const [initialPages, setInitialPages] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const needsThumbnailRef = useRef(false);

  // canvasSection 容器，作为两个抽屉的挂载容器（仅覆盖画布区域）
  const [canvasSectionEl, setCanvasSectionEl] = useState<HTMLDivElement | null>(null);
  const canvasSectionRef = useCallback((el: HTMLDivElement | null) => {
    setCanvasSectionEl(el);
  }, []);

  // ── 加载应用初始 pages ────────────────────────────────────────────────────
  useEffect(() => {
    if (!application_id) return;
    applicationApi
      .fetchApplication(application_id)
      .then((res) => {
        const application = res.data!;
        setInitialPages(application.pages || []);
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
    contextMenu,
    MaterialPalette,
  } = useDesignBanvas(loaded ? initialPages : [], banvasOptions);

  // ── 向 ApplicationLayout 注册 getPages（供 handleBuild 序列化） ───────────
  useEffect(() => {
    registerGetPages(() => actions.getSerializedPages());
    return () => unregisterGetPages();
  }, [registerGetPages, unregisterGetPages, actions]);

  // ── 订阅 saveApp 事件：序列化 pages 并调用 API 保存 ───────────────────────
  // 发布方：ApplicationLayout 保存按钮 / AiBar onBeforeSend
  useEffect(() => {
    if (!application_id) return;
    const unsubscribe = appEvents.onSaveApp(async () => {
      const pages = actions.getSerializedPages();
      await applicationApi.updateApplication(application_id, { pages });
    });
    return unsubscribe;
  }, [application_id, actions]);

  // ── 向 AiBar 注册画布回调（onDone / onPagesSnapshot） ────────────────────
  useEffect(() => {
    registerAiCallbacks({
      onDone: (aiPages) => setInitialPages(aiPages),
      onPagesSnapshot: (aiPages) => setInitialPages(aiPages),
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
  useEffect(() => {
    if (!loaded) return;
    const prompt = initialPromptRef.current;
    if (!prompt) return;
    initialPromptRef.current = null; // 只触发一次
    // 等一帧，确保 AiBar 已挂载并完成 useImperativeHandle 绑定
    const raf = requestAnimationFrame(() => {
      aiBarHandle?.sendPrompt(prompt);
    });
    return () => cancelAnimationFrame(raf);
  }, [loaded, aiBarHandle]);

  // ── 自动生成缩略图 ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!loaded || !application_id || !needsThumbnailRef.current) return;
    if (initialPages.length === 0) return;
    const timer = setTimeout(() => {
      if (!needsThumbnailRef.current) return;
      needsThumbnailRef.current = false;
      const dataUrl = actions.exportImage("image/png");
      if (!dataUrl) return;
      fetch(dataUrl)
        .then((res) => res.blob())
        .then((blob) => applicationApi.uploadThumbnail(application_id, blob))
        .catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [loaded, application_id, actions, initialPages.length]);

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
            MaterialPalette={MaterialPalette}
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
    </div>
  );
};

export default UIPage;
