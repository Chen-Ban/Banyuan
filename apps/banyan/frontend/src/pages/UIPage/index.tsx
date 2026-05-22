import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  useDesignBanvas,
  DesignContextMenu,
  PageList,
} from "@banyuan/banyan-sdk";
import { version as canvasVersion } from "@banyuan/banyan-sdk";
import { message } from "antd";
import { applicationApi, buildApi } from "@/api";
import type { Platform } from "@/api";
import { getErrorMessage } from "@/utils/error";
import AiBar from "@/components/AiBar";
import ComponentPalette from "./components/ComponentPalette";
import PropertyDrawer from "./components/PropertyDrawer";
import BuildTaskModal from "./components/BuildTaskModal";
import styles from "./index.module.scss";

const AUTO_SAVE_DELAY = 800;
const MIN_PANEL_WIDTH = 140;
const MAX_PANEL_WIDTH = 400;
const DEFAULT_PANEL_WIDTH = 200;

const UIPage = () => {
  const { id: application_id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [applicationName, setApplicationName] = useState("");
  const [applicationDescription, setApplicationDescription] = useState("");
  const [initialPages, setInitialPages] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const needsThumbnailRef = useRef(false);

  // 构建相关状态
  const [buildModalOpen, setBuildModalOpen] = useState(false);
  const [buildTaskId, setBuildTaskId] = useState<string | null>(null);
  const [buildSubmitting, setBuildSubmitting] = useState(false);

  // mainContent 容器，作为 antd Drawer 的挂载容器
  const [mainContentEl, setMainContentEl] = useState<HTMLDivElement | null>(
    null,
  );
  const mainContentRef = useCallback((el: HTMLDivElement | null) => {
    setMainContentEl(el);
  }, []);

  // ── PageList 可拖拽宽度 ──────────────────────────────────────────────────
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = panelWidth;
  }, [panelWidth]);

  useEffect(() => {
    if (!isResizing) return;
    const handleMove = (e: MouseEvent) => {
      const delta = e.clientX - resizeStartX.current;
      const newWidth = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, resizeStartWidth.current + delta));
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


  // 用于自动保存名称/描述的 debounce
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameRef = useRef(applicationName);
  const descRef = useRef(applicationDescription);
  nameRef.current = applicationName;
  descRef.current = applicationDescription;

  // 加载应用数据
  useEffect(() => {
    if (!application_id) return;
    applicationApi
      .fetchApplication(application_id)
      .then((res) => {
        const application = res.data!;
        setApplicationName(application.name);
        setApplicationDescription(application.description || "");
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

  useEffect(() => {
    if (selectedViewId !== "") {
      setRightOpen(true);
    } else if (prevSelectedViewIdRef.current === "") {
      setRightOpen(false);
    }
    prevSelectedViewIdRef.current = selectedViewId;
  }, [selectedViewId]);

  // ── 自动生成缩略图：画布就绪后若无 thumbnail 且有内容，导出第一页上传 ─────────
  useEffect(() => {
    if (!loaded || !application_id || !needsThumbnailRef.current) return;
    // 空白应用（无 pages）不生成缩略图
    if (initialPages.length === 0) return;
    // 延迟等画布渲染完成
    const timer = setTimeout(() => {
      if (!needsThumbnailRef.current) return;
      needsThumbnailRef.current = false;
      const dataUrl = actions.exportImage("image/png");
      if (!dataUrl) return;
      // DataURL → Blob
      fetch(dataUrl)
        .then((res) => res.blob())
        .then((blob) => applicationApi.uploadThumbnail(application_id, blob))
        .catch(() => {
          // 静默失败，缩略图不是关键路径
        });
    }, 500);
    return () => clearTimeout(timer);
  }, [loaded, application_id, actions, initialPages.length]);

  /**
   * 自动保存名称/描述（debounce）
   */
  const triggerAutoSaveMeta = useCallback(() => {
    if (!application_id) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      try {
        await applicationApi.updateApplication(application_id, {
          name: nameRef.current,
          description: descRef.current,
        });
      } catch {
        // 静默失败
      }
    }, AUTO_SAVE_DELAY);
  }, [application_id]);

  const handleNameChange = useCallback(
    (value: string) => {
      setApplicationName(value);
      triggerAutoSaveMeta();
    },
    [triggerAutoSaveMeta],
  );

  const handleDescChange = useCallback(
    (value: string) => {
      setApplicationDescription(value);
      triggerAutoSaveMeta();
    },
    [triggerAutoSaveMeta],
  );

  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, []);

  /**
   * 保存整个应用（含页面画布数据）
   */
  const handleSave = useCallback(async () => {
    if (!applicationName.trim()) {
      message.warning("请输入应用名称");
      return;
    }
    if (!application_id) return;

    setSaving(true);
    try {
      const pages = actions.getSerializedPages();
      await applicationApi.updateApplication(application_id, {
        name: applicationName,
        description: applicationDescription,
        pages,
      });
      message.success("应用已保存");

      // 保存成功后更新封面（异步，不阻塞主流程）
      const dataUrl = actions.exportImage("image/png");
      if (dataUrl) {
        fetch(dataUrl)
          .then((res) => res.blob())
          .then((blob) => applicationApi.uploadThumbnail(application_id, blob))
          .catch(() => {});
      }
    } catch (error: unknown) {
      message.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }, [applicationName, applicationDescription, actions, application_id]);

  /**
   * 生成应用（提交构建任务）
   */
  const handleBuild = useCallback(async () => {
    if (!applicationName.trim()) {
      message.warning("请先输入应用名称");
      return;
    }

    setBuildSubmitting(true);
    try {
      const serializedPages = actions.getSerializedPages();
      const appJson = JSON.stringify(serializedPages);

      const platform: Platform = navigator.platform
        .toLowerCase()
        .includes("mac")
        ? "mac"
        : navigator.platform.toLowerCase().includes("linux")
          ? "linux"
          : "win";

      const res = await buildApi.submitBuild({
        appJson,
        appName: applicationName,
        platform,
        width: canvasSize.width,
        height: canvasSize.height,
        canvasVersion,
      });

      setBuildTaskId(res.taskId);
      setBuildModalOpen(true);
      message.success("构建任务已提交");
    } catch (error: unknown) {
      message.error(getErrorMessage(error));
    } finally {
      setBuildSubmitting(false);
    }
  }, [applicationName, actions, canvasSize]);

  const handleBack = () => navigate("/");

  if (!loaded) {
    return <div style={{ padding: 40, textAlign: "center" }}>加载中...</div>;
  }

  return (
    <div className={styles.applicationDetailPage}>
      <ComponentPalette
        applicationName={applicationName}
        applicationDescription={applicationDescription}
        saving={saving}
        onNameChange={handleNameChange}
        onDescriptionChange={handleDescChange}
        onSave={handleSave}
        onBack={handleBack}
        onBuild={handleBuild}
        building={buildSubmitting}
        materialContent={<MaterialPalette />}
      />
      <div className={styles.mainContent} ref={mainContentRef}>
        {/* 左侧可拖拽：PageList */}
        <div className={styles.pageListPanel} style={{ width: panelWidth }}>
          <PageList
            pages={pages}
            currentPageId={currentPageId}
            actions={actions}
          />
          <div
            className={`${styles.resizeHandle} ${isResizing ? styles.resizing : ""}`}
            onMouseDown={handleResizeStart}
          />
        </div>

        {/* 画布区域：撑满剩余空间 */}
        <div className={styles.canvasSection}>
          {Banvas}
          <AiBar
            appId={application_id!}
            mode="canvas"
            getPages={() => actions.getSerializedPages()}
            onPagesUpdate={(aiPages) => setInitialPages(aiPages)}
            onPagesSnapshot={(aiPages) => setInitialPages(aiPages)}
          />
        </div>

        {/* 右侧属性面板 */}
        <PropertyDrawer
          open={rightOpen}
          onToggle={() => setRightOpen((v) => !v)}
          container={mainContentEl!}
          selectedViewId={selectedViewId}
          actions={actions}
          pages={pages}
          currentPageId={currentPageId}
          canvasSize={canvasSize}
          onCanvasSizeChange={handleCanvasSizeChange}
          appId={application_id}
        />
      </div>
      <DesignContextMenu state={contextMenu} />
      <BuildTaskModal
        open={buildModalOpen}
        onClose={() => setBuildModalOpen(false)}
        taskId={buildTaskId}
      />
    </div>
  );
};

export default UIPage;
