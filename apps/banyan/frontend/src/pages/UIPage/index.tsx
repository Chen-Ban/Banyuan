/**
 * UIPage — 画布子页面
 *
 * 布局：左右结构
 *   ┌─────────────────┬──────────────────────────────┐
 *   │  左侧面板        │  上段：物料面板（ComponentPalette）│
 *   │  ┌───────────┐  ├──────────────────────────────┤
 *   │  │ PageList  │  │  中段：画布（Banvas + AiBar）  │
 *   │  │ (flex:1)  │  ├──────────────────────────────┤
 *   │  └───────────┘  │  （PropertyDrawer 浮层）       │
 *   └─────────────────┴──────────────────────────────┘
 *
 * 职责：
 *   - 加载应用的初始 pages 数据，初始化 useDesignBanvas
 *   - 渲染左侧面板（物料 + PageList）、画布、PropertyDrawer
 *   - 通过 AppLayoutCtx.registerGetPages 向 ApplicationLayout 注册序列化函数
 */

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useParams, useLocation } from "react-router-dom";
import {
  useDesignBanvas,
  DesignContextMenu,
  PageList,
} from "@banyuan/banyan-sdk";
import { message } from "antd";
import { applicationApi } from "@/api";
import { getErrorMessage } from "@/utils/error";
import AiBar, { type AiBarHandle } from "@/components/AiBar";
import { useAppLayoutCtx } from "@/layouts/ApplicationLayout/AppLayoutCtx";
import ComponentPalette from "./components/ComponentPalette";
import PropertyDrawer from "./components/PropertyDrawer";
import styles from "./index.module.scss";

const MIN_PANEL_WIDTH = 140;
const MAX_PANEL_WIDTH = 400;
const DEFAULT_PANEL_WIDTH = 200;

const UIPage = () => {
  const { id: application_id } = useParams<{ id: string }>();
  const location = useLocation();
  const { registerGetPages, unregisterGetPages } = useAppLayoutCtx();

  // 首页跳转时携带的初始 prompt，画布加载完成后自动发送
  const initialPromptRef = useRef<string | null>(
    (location.state as { initialPrompt?: string } | null)?.initialPrompt ?? null,
  );
  const aiBarRef = useRef<AiBarHandle>(null);

  const [initialPages, setInitialPages] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const needsThumbnailRef = useRef(false);

  // mainContent 容器，作为 antd Drawer 的挂载容器
  const [mainContentEl, setMainContentEl] = useState<HTMLDivElement | null>(
    null,
  );
  const mainContentRef = useCallback((el: HTMLDivElement | null) => {
    setMainContentEl(el);
  }, []);

  // ── 左侧面板可拖拽宽度 ────────────────────────────────────────────────────
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      resizeStartX.current = e.clientX;
      resizeStartWidth.current = panelWidth;
    },
    [panelWidth],
  );

  useEffect(() => {
    if (!isResizing) return;
    const handleMove = (e: MouseEvent) => {
      const delta = e.clientX - resizeStartX.current;
      const newWidth = Math.max(
        MIN_PANEL_WIDTH,
        Math.min(MAX_PANEL_WIDTH, resizeStartWidth.current + delta),
      );
      setPanelWidth(newWidth);
    };
    const handleUp = () => setIsResizing(false);
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };
  }, [isResizing]);

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
    pages,
    currentPageId,
    selectedViewId,
    actions,
    contextMenu,
    MaterialPalette,
  } = useDesignBanvas(loaded ? initialPages : [], banvasOptions);

  // ── 向 ApplicationLayout 注册 getPages ───────────────────────────────────
  useEffect(() => {
    registerGetPages(() => actions.getSerializedPages());
    return () => unregisterGetPages();
  }, [registerGetPages, unregisterGetPages, actions]);

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
      aiBarRef.current?.sendPrompt(prompt);
    });
    return () => cancelAnimationFrame(raf);
  }, [loaded]);

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
      {/* ── 左侧面板：PageList ── */}
      <div className={styles.leftPanel} style={{ width: panelWidth }}>
        {/* 页面列表（撑满全部高度） */}
        <div className={styles.pageListSection}>
          <PageList
            pages={pages}
            currentPageId={currentPageId}
            actions={actions}
          />
        </div>

        {/* 拖拽手柄（贴右边缘） */}
        <div
          className={`${styles.resizeHandle} ${isResizing ? styles.resizing : ""}`}
          onMouseDown={handleResizeStart}
        />
      </div>

      {/* ── 右侧：物料 + 画布 + PropertyDrawer ── */}
      <div className={styles.mainContent} ref={mainContentRef}>
        <div className={styles.canvasSection}>
          {/* 上段：物料面板 */}
          <ComponentPalette materialContent={<MaterialPalette />} />

          {/* 中段：画布 */}
          <div className={styles.canvasArea}>
            {Banvas}
            <AiBar
              ref={aiBarRef}
              appId={application_id!}
              getPages={() => actions.getSerializedPages()}
              onPagesUpdate={(aiPages) => setInitialPages(aiPages)}
              onPagesSnapshot={(aiPages) => setInitialPages(aiPages)}
            />
          </div>
        </div>

        <PropertyDrawer
          open={rightOpen}
          onToggle={() => setRightOpen((v) => !v)}
          container={mainContentEl!}
          selectedViewId={selectedViewId}
          actions={actions}
          pages={pages}
          currentPageId={currentPageId || ""}
          canvasSize={canvasSize}
          onCanvasSizeChange={handleCanvasSizeChange}
          appId={application_id}
        />
      </div>

      <DesignContextMenu state={contextMenu} />
    </div>
  );
};

export default UIPage;
