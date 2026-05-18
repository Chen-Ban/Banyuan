import {
  useMemo,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useDesignBanvas, version as banvasglVersion } from "banvasgl";
import { message, Drawer } from "antd";
import { applicationApi, buildApi } from "@/api";
import type { Platform } from "@/api";
import { getErrorMessage } from "@/utils/error";
import BuildTaskModal from "@/components/BuildTaskModal";
import AiBar from "./components/AiBar";
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

  const [applicationName, setApplicationName] = useState("");
  const [applicationDescription, setApplicationDescription] = useState("");
  const [initialPages, setInitialPages] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(isNew);
  const [saving, setSaving] = useState(false);

  // 构建相关状态
  const [buildModalOpen, setBuildModalOpen] = useState(false);
  const [buildTaskId, setBuildTaskId] = useState<string | null>(null);
  const [buildSubmitting, setBuildSubmitting] = useState(false);

  // canvasSection 容器 ref，用于 AiBar fixed 定位对齐
  const canvasSectionRef = useRef<HTMLDivElement>(null);
  // mainContent 容器，作为 antd Drawer 的挂载容器（用 state 确保 mount 后触发重渲染）
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

  // 页面尺寸（用户在「页面尺寸」tab 中手动设置）
  const [canvasSize, setCanvasSize] = useState({ width: 1280, height: 800 });

  // 右侧抽屉展开状态
  const [rightOpen, setRightOpen] = useState(true);
  // 连续两次点击空白 → 关闭右侧抽屉（记录上一次 selectedViewId）
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
    builtinComponents,
  } = useDesignBanvas(loaded ? initialPages : [], banvasOptions);

  // 属性面板自动弹出/渐进隐藏：
  // 激活容器 → 自动弹出；第一次点空白 → 切换为页面属性；第二次点空白 → 隐藏面板
  useEffect(() => {
    if (selectedViewId !== "") {
      // 有容器被激活 → 自动弹出属性面板
      setRightOpen(true);
    } else if (prevSelectedViewIdRef.current === "") {
      // 连续两次空白（上一次也是空）→ 关闭面板
      setRightOpen(false);
    }
    // else: 从有选中变为空（第一次点空白）→ 保持面板打开，显示页面属性
    prevSelectedViewIdRef.current = selectedViewId;
  }, [selectedViewId]);

  // AI 完成后，用最终 pages 刷新画布（更新 initialPages 触发 useDesignBanvas 重新加载）
  const handleAiPagesUpdate = useCallback((aiPages: string[]) => {
    setInitialPages(aiPages);
  }, []);

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
        // 静默失败，不打扰用户
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

  // 清理 timer
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
          id: newId,
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

      // 检测当前平台
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
        banvasglVersion,
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

  const handleBack = () => {
    navigate("/");
  };

  const handleDatabase = useCallback(() => {
    if (id && !isNew) navigate(`/application/${id}/database`);
  }, [id, isNew, navigate]);

  if (!loaded) {
    return <div style={{ padding: 40, textAlign: "center" }}>加载中...</div>;
  }

  return (
    <div className={styles.applicationDetailPage}>
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
        onDatabase={!isNew && id ? handleDatabase : undefined}
        builtinComponents={builtinComponents}
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
        <div className={styles.canvasSection} ref={canvasSectionRef}>
          <div className={styles.canvasArea}>
            {Banvas}
          </div>
          {!isNew && id && (
            <>
              <div className={styles.aiBarPlaceholder} />
              <AiBar
                appId={id}
                onPagesUpdate={handleAiPagesUpdate}
                onPagesSnapshot={handleAiPagesUpdate}
                containerRef={canvasSectionRef}
              />
            </>
          )}
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
