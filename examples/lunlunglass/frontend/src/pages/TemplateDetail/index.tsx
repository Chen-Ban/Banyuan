import {
  useMemo,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useDesignBanvas } from "banvasgl";
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

  // 页面尺寸（用户在「页面尺寸」tab 中手动设置）
  // 默认选中 58mm 热敏打印机预设（220px 宽）
  const [canvasSize, setCanvasSize] = useState({ width: 220, height: 400 });

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
    if (!dataUrl) return;

    // 热敏打印机为黑白，对预览图做灰度 + 二值化处理
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const threshold = 180; // 二值化阈值，低于此值视为黑
      for (let i = 0; i < data.length; i += 4) {
        // 加权灰度：人眼对绿色最敏感
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        const bw = gray < threshold ? 0 : 255;
        data[i] = bw;
        data[i + 1] = bw;
        data[i + 2] = bw;
        // alpha 保持不变
      }
      ctx.putImageData(imageData, 0, 0);
      setPreviewDataUrl(canvas.toDataURL('image/png'));
      setPreviewVisible(true);
    };
    img.src = dataUrl;
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
        <div className={styles.canvasSection}>
          {Banvas}
        </div>
        <PropertyPanel
          selectedViewId={selectedViewId}
          actions={actions}
          pages={pages}
          currentPageId={currentPageId}
          canvasSize={canvasSize}
          onCanvasSizeChange={handleCanvasSizeChange}
        />
      </div>
      <ContextMenu state={contextMenu} />
      <Modal
        open={previewVisible}
        title="画布预览"
        footer={null}
        onCancel={() => setPreviewVisible(false)}
        width={800}
        centered
        styles={{ body: { padding: 0 } }}
      >
        <div className={styles.previewModalBody}>
          {/* 左侧：预览图 */}
          <div className={styles.previewLeft}>
            {previewDataUrl && (
              <img
                src={previewDataUrl}
                alt="canvas preview"
                style={{
                  display: 'block',
                  width: canvasSize.width,
                  height: canvasSize.height,
                  maxWidth: '100%',
                  maxHeight: '60vh',
                  objectFit: 'contain',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.18), 0 1px 6px rgba(0,0,0,0.10)',
                  borderRadius: 2,
                  background: '#fff',
                }}
              />
            )}
          </div>
          {/* 右侧：基本信息 */}
          <div className={styles.previewRight}>
            <div className={styles.previewInfoTitle}>基本信息</div>
            <div className={styles.previewInfoRow}>
              <span className={styles.previewInfoLabel}>名称</span>
              <span className={styles.previewInfoValue}>{templateName || '—'}</span>
            </div>
            <div className={styles.previewInfoRow}>
              <span className={styles.previewInfoLabel}>描述</span>
              <span className={styles.previewInfoValue}>{templateDescription || '暂无描述'}</span>
            </div>
            <div className={styles.previewInfoRow}>
              <span className={styles.previewInfoLabel}>画布尺寸</span>
              <span className={styles.previewInfoValue}>{canvasSize.width} × {canvasSize.height} px</span>
            </div>
            <div className={styles.previewInfoRow}>
              <span className={styles.previewInfoLabel}>页面数</span>
              <span className={styles.previewInfoValue}>{pages.length} 页</span>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default TemplateDetail;
