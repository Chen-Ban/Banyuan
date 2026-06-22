/**
 * useCanvasCore — Canvas 初始化共享底座
 *
 * 职责（模式无关）：
 *   1. DPR 监听（useBOMProperties）
 *   2. App 实例创建与销毁
 *   3. ResizeObserver 容器尺寸测量
 *   4. version 订阅（useSyncExternalStore）
 *   5. 基础派生值（selectedViewId / currentPageId）
 *   6. textInput overlay
 *   7. DOM ref 管理
 *
 * 被 useFixedCanvasInit / useAdaptiveCanvasInit 共用。
 * 不包含任何模式相关逻辑（camera 初始化、resize 策略、样式计算等）。
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { App } from "@banyuan/banvasgl";
import { createBanvasActions } from "@banyuan/banvasgl";
import type { IBanvasActions } from "@banyuan/banvasgl";
import type { IAppOptions } from "@banyuan/banvasgl";
import type { IRendererOptions } from "@banyuan/banvasgl";
import type { FrontendCapProxy } from "@banyuan/banvasgl";
import { WebPlatformCanvas } from "../platform/WebPlatformCanvas.js";
import { useBOMProperties } from "./useBOMProperties.js";

// ── 构建前端能力代理（闭包捕获 App 实例，供 FlowRunner 调用） ──
function buildFrontendCap(app: App): FrontendCapProxy {
  return {
    httpClient: {
      request: async (method, url, headers, body) => {
        const resp = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
        return { status: resp.status, body: await resp.json().catch(() => null), headers: Object.fromEntries(resp.headers) };
      },
    },
    navigate: async (target, _params) => {
      const scene = app.getCurrentScene();
      if (!scene) return;
      // 查找目标页面并导航
      const pages = app.getScenes();
      const targetScene = pages.find(s => s.id === target);
      if (targetScene) {
        app.navigateTo(targetScene);
      }
    },
    setViewData: (viewId, key, value) => {
      const scene = app.getCurrentScene();
      if (!scene) return;
      const view = scene.findViewById(viewId);
      if (view) {
        view.setData({ [key]: value });
      }
    },
    setViewVisible: (viewId, visible) => {
      const scene = app.getCurrentScene();
      if (!scene) return;
      const view = scene.findViewById(viewId);
      if (view) {
        view.setVisible(visible);
      }
    },
    playAnimation: (_viewId, _animationId) => {
      // TODO: 动画系统成熟后由 AnimationManager 按名称触发已注册动画
    },
  };
}

// ── 类型 ──

export interface UseCanvasCoreOptions {
  appOptions?: Partial<IAppOptions>;
  rendererOptions?: Omit<IRendererOptions, "dpr">;
  /** 是否启用文本输入（隐藏的 input 元素） */
  textInput?: boolean;
}

export interface UseCanvasCoreResult {
  /** 安全受限的操作接口，app 未就绪时为 null */
  actions: IBanvasActions | null;
  /** App 实例（供上层 hook 读取 designSize 等） */
  app: App | null;
  /** canvas DOM 节点 */
  canvasNode: HTMLCanvasElement | null;
  /** 容器 CSS 尺寸 */
  containerSize: { width: number; height: number };
  /** 设备像素比 */
  dpr: number;
  /** 最新的 dpr 值（ref 形式，供 Effect 内部读取但不作为依赖） */
  dprRef: React.MutableRefObject<number>;
  /** 画布状态修订号，每次 Scene 变更递增 */
  version: number;
  /** 当前选中视图 ID（空字符串表示未选中） */
  selectedViewId: string;
  /** 当前活跃页面 ID（null 表示无页面） */
  currentPageId: string | null;

  // ── DOM ref ──
  /** 容器 callback ref（挂载时测量 + ResizeObserver 持续监听） */
  mergedContainerRef: (node: HTMLDivElement | null) => void;
  /** canvas callback ref */
  canvasCallbackRef: (node: HTMLCanvasElement | null) => void;

  // ── textInput ──
  /** 文本输入 input DOM 节点（供交互 hook 绑定 IME 事件，未启用时为 null） */
  inputElement: HTMLInputElement | null;
  /** textInput 覆盖层 React 元素 */
  textInputOverlay: React.ReactElement | null;
}

/**
 * useCanvasCore — 模式无关的 Canvas 初始化共享底座
 */
export function useCanvasCore(
  options: UseCanvasCoreOptions,
): UseCanvasCoreResult {
  const { dpr } = useBOMProperties();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canvasNode, setCanvasNode] = useState<HTMLCanvasElement | null>(null);
  const [app, setApp] = useState<App | null>(null);
  const [actions, setActions] = useState<IBanvasActions | null>(null);

  // ref 持有最新的 options 和 dpr，供 Effect 内部读取但不作为依赖
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const dprRef = useRef(dpr);
  dprRef.current = dpr;

  // ── textInput ──
  const textInputEnabled = options.textInput ?? false;
  const internalInputRef = useRef<HTMLInputElement | null>(null);
  const textInputOverlay = useMemo(
    () =>
      textInputEnabled ? (
        <input
          ref={internalInputRef}
          type="text"
          style={{
            opacity: 0,
            position: "absolute",
            left: 0,
            top: 0,
            width: 100,
            height: 20,
            pointerEvents: "none",
          }}
        />
      ) : null,
    [textInputEnabled],
  );

  // ── 容器尺寸自测量 ──
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // callback ref：触发 state 变化
  const canvasCallbackRef = useCallback((node: HTMLCanvasElement | null) => {
    setCanvasNode(node);
  }, []);

  // Effect 1: App 初始化 + Actions 创建
  // 只在 canvas DOM 节点挂载/卸载时执行。
  // dpr/options 变化不需要销毁重建 App——dpr 走 handleResize，options 是一次性初始化配置。
  useEffect(() => {
    if (!canvasNode) return;

    const opts = optionsRef.current;
    const appOpts = { flowEnabled: false, ...(opts.appOptions ?? {}) } as IAppOptions;
    const _app = App.create(
      new WebPlatformCanvas(canvasNode, opts.rendererOptions),
      appOpts,
      {
        ...opts.rendererOptions,
        dpr: dprRef.current,
      },
    );
    _app.launch({});
    setApp(_app);
    setActions(createBanvasActions(() => _app));

    // 延迟注入前端能力代理（App 创建后才能构建 cap，因其需要访问 App 实例）
    _app.initFlowRunner(buildFrontendCap(_app));

    return () => {
      _app.destroy();
      setApp(null);
      setActions(null);
    };
  }, [canvasNode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── version 订阅驱动重渲染 ──
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!app) return () => {};
      return app.subscribe(onStoreChange);
    },
    [app],
  );

  const getSnapshot = useCallback(() => {
    if (!app) return 0;
    return app.getVersion();
  }, [app]);

  const version = useSyncExternalStore(subscribe, getSnapshot);

  // ── 派生状态（version 驱动） ──
  const selectedViewId = useMemo(() => {
    if (!app) return "";
    const scene = app.getCurrentScene();
    if (!scene) return "";
    const selected = scene.getSelectedView();
    return selected?.id ?? "";
  }, [app, version]);

  const currentPageId = useMemo(() => {
    if (!app) return null;
    const scene = app.getCurrentScene();
    return scene?.id ?? null;
  }, [app, version]);

  // ── 容器 callback ref：挂载时测量 + ResizeObserver 持续监听 ──
  const roRef = useRef<ResizeObserver | null>(null);
  const mergedContainerRef = useCallback((node: HTMLDivElement | null) => {
    if (roRef.current) {
      roRef.current.disconnect();
      roRef.current = null;
    }

    containerRef.current = node;

    if (!node) return;

    const { width, height } = node.getBoundingClientRect();
    if (width > 0 && height > 0) {
      setContainerSize({
        width: Math.floor(width),
        height: Math.floor(height),
      });
    }

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const rect = entry.contentRect;
        if (rect.width > 0 && rect.height > 0) {
          setContainerSize({
            width: Math.floor(rect.width),
            height: Math.floor(rect.height),
          });
        }
      }
    });
    ro.observe(node);
    roRef.current = ro;
  }, []);

  // 组件卸载时清理 observer
  useEffect(() => {
    return () => {
      if (roRef.current) {
        roRef.current.disconnect();
        roRef.current = null;
      }
    };
  }, []);

  return {
    actions,
    app,
    canvasNode,
    containerSize,
    dpr,
    dprRef,
    version,
    selectedViewId,
    currentPageId,
    mergedContainerRef,
    canvasCallbackRef,
    inputElement: textInputEnabled ? internalInputRef.current : null,
    textInputOverlay,
  };
}
