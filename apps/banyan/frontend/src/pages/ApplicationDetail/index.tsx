import {
  useMemo,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useDesignBanvas } from '@banyuan/banyan-sdk';
import { version as canvasVersion } from '@banyuan/banyan-sdk';
import { message, Drawer } from "antd";
import { applicationApi, buildApi } from "@/api";
import type { Platform } from "@/api";
import { getErrorMessage } from "@/utils/error";
import BuildTaskModal from "./components/BuildTaskModal";
import { useAppLayoutCtx } from "@/pages/ApplicationLayout";
import styles from "./index.module.scss";
import ComponentPalette from "./components/ComponentPalette";
import PropertyPanel from "./components/PropertyPanel";
import PageList from "./components/PageList";
import ContextMenu from "./components/ContextMenu";

const AUTO_SAVE_DELAY = 800;

const ApplicationDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === "new" || !id;

  // ── 通过 Layout Context 注册 pages 更新回调 ────────────────────────────
  const { setOnCanvasPagesUpdate, setGetCanvasPages } = useAppLayoutCtx();

  const [applicationName, setApplicationName] = useState("");
  const [applicationDescription, setApplicationDescription] = useState("");
  const [initialPages, setInitialPages] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(isNew);
  const [saving, setSaving] = useState(false);

  // 构建相关状态
  const [buildModalOpen, setBuildModalOpen] = useState(false);
  const [buildTaskId, setBuildTaskId] = useState<string | null>(null);
  const [buildSubmitting, setBuildSubmitting] = useState(false);

  // mainContent 容器，作为 antd Drawer 的挂载容器
  const [mainContentEl, setMainContentEl] = useState<HTMLDivElement | null>(null);
  const mainContentRef = useCallback((el: HTMLDivElement | null) => {
    setMainContentEl(el);
  }, []);

  // 用于自动保存名称/描述的 debounce
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameRef = useRef(applicationName);
  const descRef = useRef(applicationDescription);
  nameRef.current = applicationName;
  descRef.current = applicationDescription;

  // 加载应用数据
  useEffect(() => {
    if (!isNew && id) {
      applicationApi
        .fetchApplication(id)
        .then((res) => {
          const application = res.data!;
          setApplicationName(application.name);
          setApplicationDescription(application.description || "");
          setInitialPages(application.pages || []);
          setLoaded(true);
        })
        .catch((err: unknown) => {
          message.error(getErrorMessage(err));
          setLoaded(true);
        });
    }
  }, [id, isNew]);

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

  // ── 注册 pages 更新回调到 Layout ─────────────────────────────────────────
  // AiBar 在 Layout 层，done 时调用此回调刷新画布
  const handleAiPagesUpdate = useCallback((aiPages: string[]) => {
    setInitialPages(aiPages);
  }, []);

  useEffect(() => {
    setOnCanvasPagesUpdate(handleAiPagesUpdate);
  }, [setOnCanvasPagesUpdate, handleAiPagesUpdate]);

  // 注册「获取当前 pages」回调到 Layout
  // AiBar 在发送前调用，取得前端内存中最新的 pages
  const handleGetCanvasPages = useCallback((): string[] => {
    return actions.getSerializedPages();
  }, [actions]);

  useEffect(() => {
    setGetCanvasPages(handleGetCanvasPages);
  }, [setGetCanvasPages, handleGetCanvasPages]);

  /**
   * 自动保存名称/描述（仅已有应用，debounce）
   */
  const triggerAutoSaveMeta = useCallback(() => {
    if (isNew || !id) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      try {
        await applicationApi.updateApplication(id, {
          name: nameRef.current,
          description: descRef.current,
        });
      } catch {
        // 静默失败
      }
    }, AUTO_SAVE_DELAY);
  }, [isNew, id]);

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

    setSaving(true);
    try {
      const pages = actions.getSerializedPages();

      if (isNew) {
        const newId = `app_${Date.now()}`;
        await applicationApi.createApplication({
          application_id: newId,
          name: applicationName,
          description: applicationDescription,
          pages,
        });
        message.success("应用创建成功");
        navigate("/", { replace: true });
      } else {
        await applicationApi.updateApplication(id!, {
          name: applicationName,
          description: applicationDescription,
          pages,
        });
        message.success("应用已保存");
      }
    } catch (error: unknown) {
      message.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }, [applicationName, applicationDescription, actions, isNew, id, navigate]);

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

      const platform: Platform = navigator.platform.toLowerCase().includes("mac")
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
      {/* 顶部工具栏：应用信息 + 保存 + 构建（三个子页面共用 Tab，此处不再含 database/functions 跳转） */}
      <ComponentPalette
        applicationName={applicationName}
        applicationDescription={applicationDescription}
        saving={saving}
        isNew={isNew}
        onNameChange={handleNameChange}
        onDescriptionChange={handleDescChange}
        onSave={handleSave}
        onBack={handleBack}
        onBuild={handleBuild}
        building={buildSubmitting}
        materialContent={<MaterialPalette />}
      />
      <div className={styles.mainContent} ref={mainContentRef}>
        {/* 左侧固定：PageList */}
        <div className={styles.pageListPanel}>
          <PageList
            pages={pages}
            currentPageId={currentPageId}
            actions={actions}
          />
        </div>

        {/* 画布区域：撑满剩余空间 */}
        <div className={styles.canvasSection}>
          <div className={styles.canvasArea}>
            {Banvas}
          </div>
          {/* AiBar 占位：避免画布内容被底部 AiBar 遮挡 */}
          {!isNew && id && <div className={styles.aiBarPlaceholder} />}
        </div>

        {/* 右侧抽屉：PropertyPanel */}
        {mainContentEl && (
          <Drawer
            placement="right"
            open={rightOpen}
            onClose={() => setRightOpen(false)}
            mask={false}
            title={null}
            closable={false}
            getContainer={mainContentEl}
            rootStyle={{ position: 'absolute' }}
            styles={{
              wrapper: { width: 320 },
              body: { padding: 0, background: '#fafbfc' },
              header: { padding: 0, minHeight: 0, background: '#fafbfc', borderBottom: 'none' },
            }}
            zIndex={10}
          >
            <PropertyPanel
              selectedViewId={selectedViewId}
              actions={actions}
              pages={pages}
              currentPageId={currentPageId}
              canvasSize={canvasSize}
              onCanvasSizeChange={handleCanvasSizeChange}
              appId={!isNew && id ? id : undefined}
            />
          </Drawer>
        )}

        {/* 右侧切换按钮（始终显示） */}
        <button
          className={`${styles.drawerOpenBtn} ${styles.drawerOpenBtnRight}`}
          style={{ right: rightOpen ? 320 : 0 }}
          onClick={() => setRightOpen((v) => !v)}
          title={rightOpen ? "收起属性面板" : "展开属性面板"}
        >
          <span className={styles.drawerOpenBtnLabel}>属性</span>
        </button>
      </div>
      <ContextMenu state={contextMenu} />
      <BuildTaskModal
        open={buildModalOpen}
        onClose={() => setBuildModalOpen(false)}
        taskId={buildTaskId}
      />
    </div>
  );
};

export default ApplicationDetail;
