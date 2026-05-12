import {
  useMemo,
  useState,
  useEffect,
  useCallback,
  useRef,
  useLayoutEffect,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useBanvas } from "banvasgl";
import { message, Modal } from "antd";
import { templateApi } from "@/api";
import { getErrorMessage } from "@/utils/error";
import styles from "./index.module.scss";
import ComponentPalette from "./components/ComponentPalette";
import PropertyPanel from "./components/PropertyPanel";
import PageList from "./components/PageList";
import ContextMenu from "./components/ContextMenu";

const AUTO_SAVE_DELAY = 800;

const TemplateDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === "new" || !id;

  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [initialPages, setInitialPages] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewDataUrl, setPreviewDataUrl] = useState<string>("");

  // 用于自动保存名称/描述的 debounce
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameRef = useRef(templateName);
  const descRef = useRef(templateDescription);
  nameRef.current = templateName;
  descRef.current = templateDescription;

  // 加载模板数据
  useEffect(() => {
    if (!isNew && id) {
      templateApi
        .fetchTemplate(id)
        .then((res) => {
          const template = res.data!;
          setTemplateName(template.name);
          setTemplateDescription(template.description || "");
          setInitialPages(template.pages || []);
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
  } = useBanvas(loaded ? initialPages : [], banvasOptions);

  /**
   * 自动保存名称/描述（仅已有模板，debounce）
   */
  const triggerAutoSaveMeta = useCallback(() => {
    if (isNew || !id) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      try {
        await templateApi.updateTemplate(id, {
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
      setTemplateName(value);
      triggerAutoSaveMeta();
    },
    [triggerAutoSaveMeta],
  );

  const handleDescChange = useCallback(
    (value: string) => {
      setTemplateDescription(value);
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
   * 保存整个模板（含页面画布数据）
   */
  const handleSave = useCallback(async () => {
    if (!templateName.trim()) {
      message.warning("请输入模板名称");
      return;
    }

    setSaving(true);
    try {
      const pages = actions.getSerializedPages();

      if (isNew) {
        const newId = `template_${Date.now()}`;
        await templateApi.createTemplate({
          id: newId,
          name: templateName,
          description: templateDescription,
          pages,
        });
        message.success("模板创建成功");
        navigate("/template", { replace: true });
      } else {
        await templateApi.updateTemplate(id!, {
          name: templateName,
          description: templateDescription,
          pages,
        });
        message.success("模板已保存");
      }
    } catch (error: unknown) {
      message.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }, [templateName, templateDescription, actions, isNew, id, navigate]);

  const handleBack = () => {
    navigate("/template");
  };

  const handlePreview = useCallback(() => {
    const dataUrl = actions.exportImage();
    setPreviewDataUrl(dataUrl);
    setPreviewVisible(true);
  }, [actions]);

  if (!loaded) {
    return <div style={{ padding: 40, textAlign: "center" }}>加载中...</div>;
  }

  return (
    <div className={styles.templateDetailPage}>
      <ComponentPalette
        templateName={templateName}
        templateDescription={templateDescription}
        saving={saving}
        isNew={isNew}
        onNameChange={handleNameChange}
        onDescriptionChange={handleDescChange}
        onSave={handleSave}
        onBack={handleBack}
        onPreview={handlePreview}
        builtinComponents={builtinComponents}
      />
      <div className={styles.mainContent}>
        <PageList
          pages={pages}
          currentPageId={currentPageId}
          actions={actions}
        />
        <div className={styles.canvasSection} ref={canvasSectionRef}>
          {Banvas}
        </div>
        <PropertyPanel
          selectedViewId={selectedViewId}
          actions={actions}
          pages={pages}
          currentPageId={currentPageId}
        />
      </div>
      <ContextMenu state={contextMenu} />
      <Modal
        open={previewVisible}
        title="画布预览"
        footer={null}
        onCancel={() => setPreviewVisible(false)}
        width="80vw"
        centered
        styles={{ body: { textAlign: 'center', padding: '16px 0' } }}
      >
        {previewDataUrl && (
          <img
            src={previewDataUrl}
            alt="canvas preview"
            style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }}
          />
        )}
      </Modal>
    </div>
  );
};

export default TemplateDetail;
