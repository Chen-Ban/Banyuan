/**
 * UIPage — 画布子页面
 *
 * 布局：
 *   ┌──────────────────────────────┐
 *   │  上段：物料面板（UnifiedMaterialPanel）│
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
import { useParams } from "react-router-dom";
import useDesignBanvas from "@/hooks/useDesignBanvas";
import { DesignContextMenu } from "@/components/DesignEditor/DesignContextMenu";
import { App, Drawer, Tooltip } from "antd";
import { AppstoreOutlined } from "@ant-design/icons";
import { applicationApi, appContentApi } from "@/api";
import { getErrorMessage } from "@/utils/error";
import { appEvents } from "@/utils/appEvents";
import { useAppLayoutCtx } from "@/layouts/ApplicationLayout/AppLayoutCtx";
import { useRootLayoutCtx } from "@/layouts/RootLayout/RootLayoutCtx";
import UnifiedMaterialPanel from "@/components/UnifiedMaterialPanel";
import PropertyDrawer from "./components/PropertyDrawer";
import SaveMaterialModal from "@/components/SaveMaterialModal";
import styles from "./index.module.scss";

const UIPage = () => {
  const { message } = App.useApp();
  const { id: application_id } = useParams<{ id: string }>();
  const { registerGetApp, unregisterGetApp, registerDesignSizeHandler, syncDesignSize } = useAppLayoutCtx();
  const { registerAiCallbacks, unregisterAiCallbacks, aiBarHandle } = useRootLayoutCtx();

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

  const [rightOpen, setRightOpen] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const prevSelectedViewIdRef = useRef<string>("");

  // ── 保存为物料弹窗状态 ─────────────────────────────────────────────────────
  const [saveMaterialOpen, setSaveMaterialOpen] = useState(false);
  const [saveMaterialViewId, setSaveMaterialViewId] = useState("");

  // banvasOptions 使用默认设计尺寸（初始化后由 App.setDesignSize 动态更新）
  const banvasOptions = useMemo(
    () => ({
      width: 1280,
      height: 800,
      appOptions: {
        enablePageStack: true,
        maxPageStackSize: 50,
      },
      rendererOptions: {
        clearColor: "#fff",
      },
    }),
    [],
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

  // ── designSize：注册 handler + 同步初始值到 Layout ────────────────────────
  useEffect(() => {
    // actions.app 尚未就绪时（appJSON 未加载）跳过
    if (!actions?.app) return;
    // Layout 机型选择器变更时，通过此回调写入引擎
    registerDesignSizeHandler((size) => {
      actions.app.setDesignSize(size.width, size.height);
    });
    // appJSON 加载后同步引擎当前 designSize 到 Layout
    const ds = actions.app.getDesignSize();
    syncDesignSize({ width: ds.width, height: ds.height });
  }, [registerDesignSizeHandler, syncDesignSize, actions]);

  // ── 订阅 saveApp 事件：序列化 appJSON 并调用 API 保存 ───────────────────────
  // 发布方：ApplicationLayout 保存按钮 / AiBar onBeforeSend
  useEffect(() => {
    if (!application_id) return;
    const unsubscribe = appEvents.onSaveApp(async () => {
      const serialized = actions.app.getSerializedApp();
      // ADR-042：画布内容是版本化内容，走独立的 app-content 端点（自动验收的 edit 对话），
      // 而非 PUT /applications/:id（后者只更新元信息，会静默丢弃 appJSON）。
      await appContentApi.saveAppContent(application_id, serialized);
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
  // 通过事件总线的 buffered 模式解决时序问题：
  //   - HomePage emit 时若 UIPage 尚未 mount → 事件暂存在 buffer 中
  //   - UIPage mount + AiBar 就绪后注册消费者 → 自动 flush pending prompt
  //   - 无需 sessionStorage / location.state / 双 ref 守卫
  useEffect(() => {
    if (!application_id || !aiBarHandle) return;
    const unsubscribe = appEvents.onInitialPrompt(application_id, (prompt) => {
      aiBarHandle.sendPrompt(prompt);
    });
    return unsubscribe;
  }, [application_id, aiBarHandle]);

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
          <Drawer
            open={paletteOpen}
            onClose={() => setPaletteOpen(false)}
            placement="left"
            width={260}
            mask={false}
            closable={false}
            classNames={{ body: styles.drawerBody }}
            getContainer={canvasSectionEl ?? false}
            rootStyle={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, height: '100%' }}
            styles={{
              wrapper: {
                top: 12,
                bottom: 12,
                left: 12,
                height: 'calc(100% - 24px)',
                borderRadius: 12,
                border: '1px solid rgba(255, 255, 255, 0.1)',
                overflow: 'hidden',
                boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
              },
              section: {
                borderRadius: 12,
                overflow: 'hidden',
              },
            }}
          >
            <UnifiedMaterialPanel mode="render" />
          </Drawer>

          {/* 属性面板（挂载在 canvasSection，从右侧弹出，不占画布空间） */}
          <PropertyDrawer
            open={rightOpen}
            onToggle={() => setRightOpen((v) => !v)}
            container={canvasSectionEl}
            selectedViewId={selectedViewId}
            actions={actions}
            currentPageId={currentPageId || ""}
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
