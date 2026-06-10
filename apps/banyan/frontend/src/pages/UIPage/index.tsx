/**
 * UIPage — 画布子页面
 *
 * 布局：
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  mainContent (flex row)                                   │
 *   │  ┌───────────────────────────┬────────────────────────┐  │
 *   │  │  canvasSection (flex: 1)  │  FlowEditorPanel       │  │
 *   │  │  ┌─────────────────────┐  │  (width: 560px,        │  │
 *   │  │  │  画布 + 浮层抽屉     │  │   条件渲染, 挤压画布)   │  │
 *   │  │  └─────────────────────┘  │                        │  │
 *   │  └───────────────────────────┴────────────────────────┘  │
 *   └──────────────────────────────────────────────────────────┘
 *
 * 职责：
 *   - 从 applicationStore 加载 appJSON 初始化 useDesignBanvas
 *   - 渲染物料面板、画布、PropertyDrawer
 *   - 管理 FlowEditorPanel 状态（从 EventsTab 提升）
 *   - 注册 flushHandler：路由离开或保存前将 ref 实时态 flush 到 store
 *   - 订阅 store.appJSON 变化（AI done / refreshFromBackend 后画布重载）
 *
 * 设计决策来源：docs/specs/app/metadata-dataflow.md 步骤 7
 */

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import useDesignBanvas from "@/hooks/useDesignBanvas";
import { DesignContextMenu } from "./components/DesignEditor/DesignContextMenu";
import { App, Drawer, Tooltip } from "antd";
import { AppstoreOutlined } from "@ant-design/icons";
import { applicationApi } from "@/api";
import { getErrorMessage } from "@/utils/error";
import { useApplicationStore } from "@/stores/applicationStore";
import UnifiedMaterialPanel from "@/components/UnifiedMaterialPanel";
import { FlowEditorPanel } from "@/components/FlowEditor/FlowEditorPanel";
import type { FlowEditorOpenRequest } from "./components/DesignEditor/PropertyPanel/EventsTab";
import type { FlowSchema } from "@banyuan/banvasgl";
import PropertyDrawer from "./components/PropertyDrawer";
import SaveMaterialModal from "@/components/SaveMaterialModal";
import styles from "./index.module.scss";

/** FlowEditorPanel 的状态 */
interface FlowEditorState {
  open: boolean;
  title: string;
  initialSchema: FlowSchema;
  onSave: (schema: FlowSchema) => void;
}

const CLOSED_FLOW_EDITOR: FlowEditorState = {
  open: false,
  title: '',
  initialSchema: { nodes: [], edges: [] },
  onSave: () => {},
};

const UIPage = () => {
  const { message } = App.useApp();
  const { id: application_id } = useParams<{ id: string }>();

  // ── ApplicationStore ────────────────────────────────────────────────────────
  const {
    setDesignSize,
    registerActions,
    registerFlushHandler,
    flushAppJSON,
    consumeInitialPrompt,
  } = useApplicationStore()

  // ── 画布初始化用的 appJSON（仅在以下情况更新以避免不必要的画布重初始化）：
  //    1. 首次加载
  //    2. AI done 后 refreshFromBackend 更新了 store.appJSON
  const [canvasAppJSON, setCanvasAppJSON] = useState<string>('');
  const [loaded, setLoaded] = useState(false);
  const needsThumbnailRef = useRef(false);

  // 跟踪是否为本组件自己 flush 导致的 store appJSON 变化（避免循环更新）
  const selfFlushRef = useRef(false);

  // canvasSection 容器，作为两个抽屉的挂载容器（仅覆盖画布区域）
  const [canvasSectionEl, setCanvasSectionEl] = useState<HTMLDivElement | null>(null);
  const canvasSectionRef = useCallback((el: HTMLDivElement | null) => {
    setCanvasSectionEl(el);
  }, []);

  // ── 流程编辑面板状态（从 EventsTab 提升） ────────────────────────────────────
  const [flowEditor, setFlowEditor] = useState<FlowEditorState>(CLOSED_FLOW_EDITOR);

  const handleOpenFlowEditor = useCallback((request: FlowEditorOpenRequest) => {
    setFlowEditor({
      open: true,
      title: request.title,
      initialSchema: request.initialSchema,
      onSave: request.onSave,
    });
    // 唤出流程面板时关闭属性抽屉，避免视觉拥挤
    setRightOpen(false);
  }, []);

  const handleCloseFlowEditor = useCallback(() => {
    setFlowEditor(CLOSED_FLOW_EDITOR);
  }, []);

  // ── 加载应用数据（从 store 获取 appJSON） ──────────────────────────────────
  useEffect(() => {
    if (!application_id) return;
    // store.load 在 ApplicationLayout 中已调用，这里只需从 store 读取
    // 但为安全起见，如果 store 未加载（appId 不匹配），fallback 加载
    const state = useApplicationStore.getState();
    if (state.appId === application_id && state.appJSON !== undefined) {
      setCanvasAppJSON(state.appJSON);
      setLoaded(true);
      // 检测是否需要缩略图
      applicationApi.fetchApplication(application_id).then((res) => {
        needsThumbnailRef.current = !res.data?.thumbnail;
      }).catch(() => {});
    } else {
      applicationApi
        .fetchApplication(application_id)
        .then((res) => {
          const application = res.data!;
          setCanvasAppJSON(application.appJSON || '');
          needsThumbnailRef.current = !application.thumbnail;
          setLoaded(true);
        })
        .catch((err: unknown) => {
          message.error(getErrorMessage(err));
          setLoaded(true);
        });
    }
  }, [application_id, message]);

  // ── 订阅 store.appJSON 变化（AI done 后 refreshFromBackend 更新） ─────────
  useEffect(() => {
    const unsub = useApplicationStore.subscribe((state, prevState) => {
      if (state.appJSON === prevState.appJSON) return;
      // appJSON 发生变化：若是自己 flush 导致的则消费 flag 并跳过，否则更新画布
      if (selfFlushRef.current) {
        selfFlushRef.current = false;
      } else {
        setCanvasAppJSON(state.appJSON);
      }
    });
    return unsub;
  }, []);

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
  } = useDesignBanvas(loaded ? canvasAppJSON : '', banvasOptions);

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

  // ── 挂载画布引擎实例到 store（供 Layout build / 机型切换 / 外部消费） ────────
  useEffect(() => {
    if (!actions?.app) return;
    const unregister = registerActions(actions);
    // appJSON 加载后同步引擎当前 designSize 到 store
    const ds = actions.app.getDesignSize();
    setDesignSize({ width: ds.width, height: ds.height });
    return unregister;
  }, [registerActions, setDesignSize, actions]);

  // ── 注册 flushHandler：将画布实时态 flush 到 store ───────────────────────────
  useEffect(() => {
    if (!application_id) return;
    const unsubscribe = registerFlushHandler(async () => {
      const serialized = actions.app.getSerializedApp();
      selfFlushRef.current = true;
      flushAppJSON(serialized);
    });
    return unsubscribe;
  }, [application_id, actions, registerFlushHandler, flushAppJSON]);

  // ── 路由离开时自动 flush ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      // unmount 时将当前画布状态 flush 到 store
      try {
        const serialized = actions.app.getSerializedApp();
        selfFlushRef.current = true;
        useApplicationStore.getState().flushAppJSON(serialized);
      } catch {
        // actions 可能已销毁，静默忽略
      }
    };
  }, [actions]);

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
    if (!application_id) return;
    const prompt = consumeInitialPrompt(application_id);
    if (prompt) {
      useApplicationStore.getState().setInitialPrompt(application_id, prompt);
    }
  }, [application_id, consumeInitialPrompt]);

  // ── 自动生成缩略图 ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!loaded || !application_id || !needsThumbnailRef.current) return;
    if (!canvasAppJSON) return;
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
  }, [loaded, application_id, actions, canvasAppJSON]);

  if (!loaded) {
    return <div style={{ padding: 40, textAlign: "center" }}>加载中...</div>;
  }

  return (
    <div className={styles.page}>
      {/* ── 画布区域：物料 + 画布 + PropertyDrawer + FlowEditorPanel ── */}
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
            onOpenFlowEditor={handleOpenFlowEditor}
          />
        </div>

        {/* 流程编辑面板（flex item，打开时挤压左侧画布区域） */}
        <FlowEditorPanel
          open={flowEditor.open}
          title={flowEditor.title}
          initialSchema={flowEditor.initialSchema}
          onSave={flowEditor.onSave}
          onClose={handleCloseFlowEditor}
        />
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
