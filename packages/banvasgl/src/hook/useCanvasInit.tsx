import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { App } from "@/engine/App.js";
import { OrthographicCamera } from "@/engine/camera/index.js";
import { Scene } from "@/engine/scene/Scene";
import { createBanvasActions } from "@/actions/index.js";
import type { IBanvasActions } from "@/types/hook/hook.js";
import type { IAppOptions } from "@/types/engine/app.js";
import type { IRendererOptions } from "@/types/engine/renderer.js";
import { useCanvasCamera } from "./useCanvasCamera.js";

// ── BOM 属性（内联，避免跨目录依赖） ──
function useBOMProperties(): { dpr: number } {
  const [dpr, setDpr] = useState<number>(() =>
    typeof window !== "undefined" ? (window.devicePixelRatio ?? 1) : 1,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    let mql: MediaQueryList | null = null;

    const listen = () => {
      const currentDpr = window.devicePixelRatio ?? 1;
      setDpr(currentDpr);
      mql?.removeEventListener("change", listen);
      mql = window.matchMedia(`(resolution: ${currentDpr}dppx)`);
      mql.addEventListener("change", listen);
    };

    listen();

    return () => {
      mql?.removeEventListener("change", listen);
    };
  }, []);

  return { dpr };
}

// ── 公共类型 ──

export interface UseCanvasOptions {
  /**
   * 页面样式宽度（设计尺寸，CSS 像素）。
   *
   * 传了 width + height → **固定模式**：
   * - 画布物理像素 = width * dpr × height * dpr（保证高清）
   * - dpr 融入 View 的 MVP 变换矩阵，渲染时自动映射到物理像素
   * - 相机在逻辑空间操作，bounds = [0, width] × [0, height]，不乘 dpr
   * - CSS 样式尺寸在容器内做长边适配（contain fit）居中展示
   *
   * 不传 → **自适应模式**：画布尺寸和相机边界跟随容器实际尺寸动态变化。
   */
  width?: number;
  /**
   * 页面样式高度（设计尺寸，CSS 像素）。
   * 含义与 width 相同，两者必须同时传或同时不传。
   */
  height?: number;
  appOptions?: IAppOptions;
  rendererOptions?: Omit<IRendererOptions, "dpr">;
  /**
   * 是否启用文本输入（隐藏的 input 元素）
   *
   * 启用后，容器内会自动渲染一个透明的 input 用于接收 IME/键盘输入，
   * derived.inputElement 返回该 DOM 节点供交互 hook 使用。
   *
   * 默认 false（移动端或流程图场景不需要此能力）。
   */
  textInput?: boolean;
}

/** 选中视图在 viewport 中的 CSS 坐标和尺寸 */
export interface SelectedViewPos {
  /** 视图左上角相对于 viewport 的 CSS x 坐标 */
  x: number;
  /** 视图左上角相对于 viewport 的 CSS y 坐标 */
  y: number;
  /** 视图 CSS 宽度 */
  width: number;
  /** 视图 CSS 高度 */
  height: number;
}

export interface UseCanvasInitResult {
  /** 安全受限的操作接口，app 未就绪时为 null */
  actions: IBanvasActions | null;
  /** 渲染元素 */
  elements: {
    /** 画布容器（含 canvas + textInput），直接放到 JSX 中 */
    container: React.ReactElement;
  };
  /** version 驱动的派生值与 DOM 引用 */
  derived: {
    /** 画布状态修订号，每次 Scene 变更递增，可用作 useMemo 依赖 */
    revision: number;
    /** 当前选中视图 ID（空字符串表示未选中） */
    selectedViewId: string;
    /** 当前活跃页面 ID（null 表示无页面） */
    currentPageId: string | null;
    /** 当前选中视图在 viewport 中的 CSS 坐标和尺寸（null 表示无选中） */
    selectedViewPos: SelectedViewPos | null;
    /** canvas DOM 节点（供交互 hook 绑定事件） */
    canvas: HTMLCanvasElement | null;
    /** 文本输入 input DOM 节点（供交互 hook 绑定 IME 事件，未启用时为 null） */
    inputElement: HTMLInputElement | null;
  };
}

/**
 * useCanvasInit — 底层 Canvas 初始化 hook
 *
 * 职责：
 *   1. 创建并销毁 App 实例
 *   2. 将序列化的 appJSON 反序列化到 App
 *   3. 响应尺寸 / DPR 变化
 *   4. 容器 DOM 结构（div + canvas）+ ResizeObserver 自适应
 *   5. 相机驱动的无限画布交互（zoom via wheel，仅自适应模式）
 *   6. 基础派生值（selectedViewId / currentPageId / selectedViewPos）
 *
 * 被 useDesignBanvas、useFlowBanvas 共用。
 * 不包含任何事件绑定或业务逻辑。
 *
 * @param appJSON 序列化的应用 JSON（空字符串表示新建空白应用）
 * @param options 画布配置
 */
export function useCanvasInit(
  appJSON: string,
  options: UseCanvasOptions,
): UseCanvasInitResult {
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
    const _app = App.create(canvasNode, opts.appOptions ?? {}, {
      ...opts.rendererOptions,
      dpr: dprRef.current,
    });
    _app.launch({});
    setApp(_app);
    setActions(createBanvasActions(() => _app));

    return () => {
      _app.destroy();
      setApp(null);
      setActions(null);
    };
  }, [canvasNode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 判断运行模式 ──
  const isFixedMode = options.width != null && options.height != null;
  const fixedWidth = options.width;
  const fixedHeight = options.height;

  // Effect 2: 从 appJSON 恢复应用状态
  // 固定模式：相机锁定为 options.width × options.height
  // 自适应模式：初始相机在首次 resize 时由 syncCameraToContainer 设置
  useEffect(() => {
    if (!app || !actions) return;

    if (appJSON) {
      app.initFromSerialized(appJSON);
    } else {
      // 空应用：创建默认空白页
      const w = fixedWidth ?? 800;
      const h = fixedHeight ?? 600;
      const camera = new OrthographicCamera({
        left: 0,
        right: w,
        top: 0,
        bottom: h,
      });
      const scene = new Scene(camera);
      app.addScene(scene);
      app.navigateTo(scene);
    }

    // 固定模式：初始化时立刻设置 canvas 物理尺寸
    if (fixedWidth != null && fixedHeight != null) {
      app.handleResize(
        fixedWidth * dprRef.current,
        fixedHeight * dprRef.current,
        dprRef.current,
      );
    }

    actions.app.notify();
  }, [app, appJSON, actions]);

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

  const selectedViewPos = useMemo((): SelectedViewPos | null => {
    if (!actions || !selectedViewId || !canvasNode) return null;
    const view = actions.view.getViewInstance(selectedViewId);
    if (!view) return null;

    // matrix 的平移分量 (0,3) (1,3)
    const tx = view.matrix.get(0, 3);
    const ty = view.matrix.get(1, 3);
    const w = (view.style?.width as number | undefined) ?? 0;
    const h = (view.style?.height as number | undefined) ?? 0;

    // 世界坐标 → viewport CSS 坐标
    // 逻辑画布尺寸：固定模式用设计尺寸，自适应模式用容器 CSS 尺寸
    const rect = canvasNode.getBoundingClientRect();
    const logicalW = fixedWidth ?? rect.width;
    const logicalH = fixedHeight ?? rect.height;
    const scaleX = rect.width / logicalW;
    const scaleY = rect.height / logicalH;

    return {
      x: rect.left + tx * scaleX,
      y: rect.top + ty * scaleY,
      width: w * scaleX,
      height: h * scaleY,
    };
  }, [actions, selectedViewId, canvasNode, version, fixedWidth, fixedHeight]);

  // ── 相机驱动的无限画布交互（仅自适应模式） ──
  const { syncCameraToContainer } = useCanvasCamera({
    app,
    canvas: canvasNode,
    enabled: !isFixedMode,
  });

  // ── 容器 resize 时同步 ──
  // 固定模式：仅在 dpr 变化时更新物理像素，camera 不动
  // 自适应模式：更新 canvas 物理像素 + camera bounds
  useEffect(() => {
    if (!app || containerSize.width <= 0 || containerSize.height <= 0) return;

    if (isFixedMode && fixedWidth != null && fixedHeight != null) {
      // 固定模式：dpr 可能变化（如拖到外接屏），需更新物理像素
      const currentDpr = window.devicePixelRatio ?? 1;
      app.handleResize(
        fixedWidth * currentDpr,
        fixedHeight * currentDpr,
        currentDpr,
      );
      const scene = app.getCurrentScene();
      if (scene) scene.markDirty();
    } else {
      syncCameraToContainer(
        containerSize.width,
        containerSize.height,
        window.devicePixelRatio ?? 1,
      );
    }
  }, [
    app,
    containerSize,
    syncCameraToContainer,
    isFixedMode,
    fixedWidth,
    fixedHeight,
  ]);

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

  // ── Canvas 样式计算 ──
  const canvasStyle: React.CSSProperties = useMemo(() => {
    if (!isFixedMode || fixedWidth == null || fixedHeight == null) {
      // 自适应模式：铺满容器
      return { display: "block", width: "100%", height: "100%" };
    }
    // 固定模式：按页面比例在容器内做长边适配（contain fit）
    if (containerSize.width <= 0 || containerSize.height <= 0) {
      // 容器尚未测量，先给一个占位样式
      return { display: "block", width: "100%", height: "100%" };
    }
    const pageAspect = fixedWidth / fixedHeight;
    const containerAspect = containerSize.width / containerSize.height;

    let styleWidth: number;
    let styleHeight: number;
    if (containerAspect > pageAspect) {
      // 容器更宽 → 高度撑满，宽度按比例
      styleHeight = containerSize.height - 36;
      styleWidth = styleHeight * pageAspect;
    } else {
      // 容器更高 → 宽度撑满，高度按比例
      styleWidth = containerSize.width - 36;
      styleHeight = styleWidth / pageAspect;
    }

    return {
      display: "block",
      width: `${styleWidth}px`,
      height: `${styleHeight}px`,
    };
  }, [isFixedMode, fixedWidth, fixedHeight, containerSize]);

  // ── 容器样式：固定模式居中，自适应模式铺满 ──
  const containerStyle: React.CSSProperties = useMemo(() => {
    const base: React.CSSProperties = {
      position: "relative",
      overflow: "hidden",
      width: "100%",
      height: "100%",
      flex: 1,
      minHeight: 0,
    };
    if (isFixedMode) {
      // 固定模式：flex 居中让 canvas 在容器中居中
      base.display = "flex";
      base.alignItems = "center";
      base.justifyContent = "center";
    }
    return base;
  }, [isFixedMode]);

  const container = useMemo(
    () => (
      <div ref={mergedContainerRef} style={containerStyle}>
        <canvas ref={canvasCallbackRef} style={canvasStyle} />
        {textInputOverlay}
      </div>
    ),
    [
      mergedContainerRef,
      canvasCallbackRef,
      canvasStyle,
      containerStyle,
      textInputOverlay,
    ],
  );

  return {
    actions,
    elements: {
      container,
    },
    derived: {
      revision: version,
      selectedViewId,
      currentPageId,
      selectedViewPos,
      canvas: canvasNode,
      inputElement: textInputEnabled ? internalInputRef.current : null,
    },
  };
}
