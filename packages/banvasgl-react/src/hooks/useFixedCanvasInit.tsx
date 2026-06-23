/**
 * useFixedCanvasInit — 固定模式 Canvas 初始化 hook
 *
 * 职责（在 useCanvasCore 共享底座之上）：
 *   1. 空应用时用 width×height 创建 camera + setDesignSize
 *   2. 容器 resize/DPR 变化时仅更新物理像素（camera 不动）
 *   3. 页面切换时强制同步 camera bounds 到 designSize
 *   4. Canvas CSS 样式：contain-fit 长边适配
 *   5. 容器 CSS 样式：flex 居中
 *   6. selectedViewPos 计算（逻辑尺寸 = designSize）
 *
 * 适用场景：UI 设计态（useDesignBanvas）、预览态（PreviewPage）、运行态（useRuntimeBanvas）
 *
 * 注意：uiJSON 已从此 hook 剥离，JSON 恢复由调用方通过 actions.app.loadAppJSON() 单独注入。
 */

import React, { useEffect, useMemo, useRef } from "react";
import { OrthographicCamera } from "@banyuan/banvasgl";
import { Scene } from "@banyuan/banvasgl";
import type { IAppOptions } from "@banyuan/banvasgl";
import type { IRendererOptions } from "@banyuan/banvasgl";
import type { IBanvasActions } from "@banyuan/banvasgl";
import { useCanvasCore } from "./useCanvasCore.js";
import { useBOMProperties } from "./useBOMProperties.js";
import type { UseCanvasCoreOptions } from "./useCanvasCore.js";

// ── 公共类型 ──

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

export interface UseFixedCanvasOptions {
  /**
   * 页面样式宽度（设计尺寸，CSS 像素）。
   * 固定模式下必传，与 height 共同决定画布逻辑尺寸。
   */
  width: number;
  /**
   * 页面样式高度（设计尺寸，CSS 像素）。
   * 固定模式下必传，与 width 共同决定画布逻辑尺寸。
   */
  height: number;
  appOptions?: Partial<IAppOptions>;
  rendererOptions?: Omit<IRendererOptions, "dpr">;
  /**
   * 是否启用文本输入（隐藏的 input 元素）
   *
   * 启用后，容器内会自动渲染一个透明的 input 用于接收 IME/键盘输入，
   * derived.inputElement 返回该 DOM 节点供交互 hook 使用。
   *
   * 默认 false。
   */
  textInput?: boolean;
}

export interface UseFixedCanvasResult {
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
 * useFixedCanvasInit — 固定模式 Canvas 初始化 hook
 *
 * 画布物理像素 = width * dpr × height * dpr（保证高清）。
 * dpr 融入 View 的 MVP 变换矩阵，渲染时自动映射到物理像素。
 * 相机在逻辑空间操作，bounds = [0, width] × [0, height]。
 * CSS 样式尺寸在容器内做长边适配（contain fit）居中展示。
 */
export function useFixedCanvasInit(
  options: UseFixedCanvasOptions,
): UseFixedCanvasResult {
  const { width, height, appOptions, rendererOptions, textInput } =
    options;

  // ref 持有最新的 width/height，供 Effect 内部读取但不作为依赖
  const widthRef = useRef(width);
  widthRef.current = width;
  const heightRef = useRef(height);
  heightRef.current = height;

  // ── 共享底座（options 由调用方保证引用稳定） ──
  const coreOptions: UseCanvasCoreOptions = useMemo(
    () => ({ appOptions, rendererOptions, textInput }),
    [appOptions, rendererOptions, textInput],
  );
  const {
    actions,
    app,
    canvasNode,
    containerSize,
    version,
    selectedViewId,
    currentPageId,
    mergedContainerRef,
    canvasCallbackRef,
    inputElement,
    textInputOverlay,
  } = useCanvasCore(coreOptions);

  const { dpr, dprRef } = useBOMProperties();

  // ── Effect 2: 空应用初始化 ──
  // 固定模式：相机锁定为 App.designSize
  // JSON 恢复由调用方通过 actions.app.loadAppJSON() 单独注入
  useEffect(() => {
    if (!app || !actions) return;

    // ── 空应用 ──
    // camera 直接使用 width × height
    // 先 resize canvas 再 navigateTo，避免 FlowSchema 在未初始化的 canvas 上触发渲染
    const w = widthRef.current;
    const h = heightRef.current;
    app.renderer.setDPR(dprRef.current);
    app.handleResize(w, h);
    const camera = new OrthographicCamera({
      left: 0,
      right: w,
      top: 0,
      bottom: h,
    });
    const scene = new Scene(camera);
    app.addScene(scene);
    app.navigateTo(scene);
    app.setDesignSize(w, h);
  }, [app, actions]);

  // ── Effect 3: 容器 resize / DPR 变化时同步 ──
  // 固定模式：用 App.designSize 更新物理像素（DPR 变化或跨屏时），camera 不动
  useEffect(() => {
    if (!app || containerSize.width <= 0 || containerSize.height <= 0) return;

    const { width: dw, height: dh } = app.getDesignSize();
    app.renderer.setDPR(dpr);
    app.handleResize(dw, dh);
    const scene = app.getCurrentScene();
    if (scene) scene.markDirty();
  }, [app, containerSize, dpr, version]); // version: designSize 变更后重新同步

  // ── Effect 4: 页面切换时强制同步 camera bounds 到 designSize ──
  // currentPageId 是 version 的派生值，仅在 scene 切换时变化
  useEffect(() => {
    if (!app || !currentPageId) return;
    const { width: dw, height: dh } = app.getDesignSize();
    const scene = app.getCurrentScene();
    if (scene && scene.camera instanceof OrthographicCamera) {
      scene.camera.setBounds(0, dw, dh, 0);
      scene.markDirty();
    } else if (scene) {
      console.warn(
        "[useFixedCanvasInit] Camera is not OrthographicCamera, page-switch bounds sync skipped.",
      );
    }
  }, [app, currentPageId]);

  // ── 派生：selectedViewPos ──
  const selectedViewPos = useMemo((): SelectedViewPos | null => {
    if (!actions || !selectedViewId || !canvasNode || !app) return null;
    const view = actions.view.getViewInstance(selectedViewId);
    if (!view) return null;

    const tx = view.matrix.get(0, 3);
    const ty = view.matrix.get(1, 3);
    const w = (view.style?.width as number | undefined) ?? 0;
    const h = (view.style?.height as number | undefined) ?? 0;

    // 世界坐标 → viewport CSS 坐标
    // 固定模式：逻辑画布尺寸用 designSize
    const rect = canvasNode.getBoundingClientRect();
    const designSize = app.getDesignSize();
    const logicalW = designSize.width;
    const logicalH = designSize.height;
    const scaleX = rect.width / logicalW;
    const scaleY = rect.height / logicalH;

    return {
      x: rect.left + tx * scaleX,
      y: rect.top + ty * scaleY,
      width: w * scaleX,
      height: h * scaleY,
    };
  }, [actions, app, selectedViewId, canvasNode, version]);

  // ── Canvas 样式：contain-fit 长边适配 ──
  const canvasStyle: React.CSSProperties = useMemo(() => {
    const designSize = app?.getDesignSize() ?? {
      width: widthRef.current,
      height: heightRef.current,
    };
    if (containerSize.width <= 0 || containerSize.height <= 0) {
      return { display: "block", width: "100%", height: "100%" };
    }
    const pageAspect = designSize.width / designSize.height;
    const containerAspect = containerSize.width / containerSize.height;

    let styleWidth: number;
    let styleHeight: number;
    if (containerAspect > pageAspect) {
      styleHeight = containerSize.height - 36;
      styleWidth = styleHeight * pageAspect;
    } else {
      styleWidth = containerSize.width - 36;
      styleHeight = styleWidth / pageAspect;
    }

    return {
      display: "block",
      width: `${styleWidth}px`,
      height: `${styleHeight}px`,
    };
  }, [app, containerSize, version]);

  // ── 容器样式：flex 居中 ──
  const containerStyle: React.CSSProperties = useMemo(
    () => ({
      position: "relative",
      overflow: "hidden",
      width: "100%",
      height: "100%",
      flex: 1,
      minHeight: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }),
    [],
  );

  // ── 容器 JSX ──
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
    elements: { container },
    derived: {
      revision: version,
      selectedViewId,
      currentPageId,
      selectedViewPos,
      canvas: canvasNode,
      inputElement,
    },
  };
}
