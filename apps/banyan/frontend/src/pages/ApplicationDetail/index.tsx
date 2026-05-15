import {
  useMemo,
  useState,
  useEffect,
  useCallback,
  useRef,
  useLayoutEffect,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useDesignBanvas, version as banvasglVersion } from "banvasgl";
import { message } from "antd";
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

  // 自适应画布尺寸：监听 canvasSection 容器大小
  const canvasSectionRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

  useLayoutEffect(() => {
    const el = canvasSectionRef.current;
    if (!el) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const PADDING = 12;
    const updateSize = () => {
      const { clientWidth, clientHeight } = el;
      const w = clientWidth - PADDING * 2;
      const h = clientHeight - PADDING * 2;
      if (w > 0 && h > 0) {
        setCanvasSize({ width: w, height: h });
      }
    };

    // 立即同步一次初始尺寸
    updateSize();

    const debouncedUpdate = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(updateSize, 100);
    };

    const observer = new ResizeObserver(debouncedUpdate);
    observer.observe(el);
    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

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
      const platform: Platform = navigator.platform.toLowerCase().includes('mac')
        ? 'mac'
        : navigator.platform.toLowerCase().includes('linux')
          ? 'linux'
          : 'win';

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
        builtinComponents={builtinComponents}
      />
      <div className={styles.mainContent}>
        <PageList
          pages={pages}
          currentPageId={currentPageId}
          actions={actions}
        />
        <div className={styles.canvasSection}>
          <div className={styles.canvasArea} ref={canvasSectionRef}>
            {Banvas}
          </div>
          {!isNew && id && (
            <AiBar appId={id} onPagesUpdate={handleAiPagesUpdate} />
          )}
        </div>
        <PropertyPanel
          selectedViewId={selectedViewId}
          actions={actions}
          pages={pages}
          currentPageId={currentPageId}
        />
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
