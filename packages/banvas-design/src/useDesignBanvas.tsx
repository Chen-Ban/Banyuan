import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useCanvasInit, useCanvasZoom } from "@banyuan/banvas-runtime-web";
import type {
  SerializedPageJSON,
  UseCanvasOptions,
} from "@banyuan/banvas-runtime-web";
import { useCanvasEvents } from "./canvas/useCanvasEvents.js";
import type { ContextMenuHitResult } from "./canvas/useCanvasEvents.js";
import { useInputEvents } from "./canvas/useInputEvents.js";
import { buildPageNodes } from "./data/builders.js";
import { createBanvasActions } from "./actions/index.js";
import { BUILTIN_COMPONENTS } from "./data/builtinComponents.js";
import {
  buildViewContextMenuItems,
  buildCanvasContextMenuItems,
} from "./data/contextMenu.js";
import type {
  IPageNode,
  IUseBanvasResult,
  IContextMenuState,
  IContextMenuItem,
  IComponentDefinition,
  IDragProps,
} from "@banyuan/banvasgl";
import { createDesignMaterialPalette } from "./components/DesignMaterialPalette.js";
import type { DesignMaterialPaletteProps } from "./components/DesignMaterialPalette.js";

export type { SerializedPageJSON, UseCanvasOptions };

export default function useDesignBanvas(
  serializedPages: SerializedPageJSON[],
  _options: UseCanvasOptions,
): IUseBanvasResult<React.ReactElement> {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // ── 容器尺寸自测量 ──
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // ── Canvas 缩放（Cmd/Ctrl + Wheel） ──
  // 只要测量到容器尺寸就启用缩放
  const zoomEnabled = containerSize.width > 0 && containerSize.height > 0;
  const {
    scale,
    styleWidth,
    styleHeight,
    zoomContainerRef,
  } = useCanvasZoom({
    canvasWidth: _options.width,
    canvasHeight: _options.height,
    containerWidth: zoomEnabled ? containerSize.width : _options.width,
    containerHeight: zoomEnabled ? containerSize.height : _options.height,
  });

  const { app, canvasRef, canvasCallbackRef } = useCanvasInit(
    serializedPages,
    _options,
  );

  const appRef = useRef(app);
  appRef.current = app;
  const getApp = useCallback(() => appRef.current, []);

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

  const _version = useSyncExternalStore(subscribe, getSnapshot);

  const actions = useMemo(() => createBanvasActions(getApp), [getApp]);

  const selectedViewId = useMemo(() => {
    if (!app) return "";
    const scene = app.getCurrentScene();
    if (!scene) return "";
    const selected = scene.getSelectedView();
    return selected?.id ?? "";
  }, [app, _version]);

  const currentPageId = useMemo(() => {
    if (!app) return null;
    const scene = app.getCurrentScene();
    return scene?.id ?? null;
  }, [app, _version]);

  const defaultContextMenu: IContextMenuState = useMemo(
    () => ({
      visible: false,
      position: { x: 0, y: 0 },
      target: "canvas",
      viewId: null,
      items: [],
      dismiss: () => {},
    }),
    [],
  );

  const [contextMenu, setContextMenu] =
    useState<IContextMenuState>(defaultContextMenu);

  const dismissContextMenu = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, visible: false }));
  }, []);

  const onContextMenuHit = useCallback(
    (hit: ContextMenuHitResult) => {
      const currentApp = appRef.current;
      if (!currentApp) return;
      const scene = currentApp.getCurrentScene();
      if (!scene) return;

      let items: IContextMenuItem[];

      if (hit.target === "view" && hit.view) {
        items = buildViewContextMenuItems(hit.view, scene, actions);
      } else {
        items = buildCanvasContextMenuItems(actions, hit.canvasPosition);
      }

      setContextMenu({
        visible: true,
        position: hit.position,
        target: hit.target,
        viewId: hit.view?.id ?? null,
        items,
        dismiss: dismissContextMenu,
      });
    },
    [actions, dismissContextMenu],
  );

  const pages: IPageNode[] = useMemo(() => {
    if (!app) return [];
    return buildPageNodes(app);
  }, [app, _version]);

  useCanvasEvents({
    app,
    canvasRef,
    inputRef,
    actions,
    onContextMenuHit,
    onInteractionEnd: () => app?.notify(),
  });

  useInputEvents({
    app,
    canvasRef,
    inputRef,
  });

  // ── 物料拖拽 props 工厂 ──
  const dragProps = useCallback(
    (component: IComponentDefinition): IDragProps => ({
      draggable: true,
      onDragStart: (e: any) => {
        e.dataTransfer.setData(
          "application/json",
          JSON.stringify({ template: component.template }),
        );
        e.dataTransfer.effectAllowed = "copy";
      },
    }),
    [],
  );

  // ── 容器 callback ref：挂载时测量 + ResizeObserver 持续监听 ──
  const roRef = useRef<ResizeObserver | null>(null);
  const mergedContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      // 清理旧 observer
      if (roRef.current) {
        roRef.current.disconnect();
        roRef.current = null;
      }

      containerRef.current = node;
      zoomContainerRef(node);

      if (!node) return;

      // 立即测量一次
      const { width, height } = node.getBoundingClientRect();
      if (width > 0 && height > 0) {
        setContainerSize({ width: Math.floor(width), height: Math.floor(height) });
      }

      // 持续监听
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const rect = entry.contentRect;
          if (rect.width > 0 && rect.height > 0) {
            setContainerSize({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
          }
        }
      });
      ro.observe(node);
      roRef.current = ro;
    },
    [zoomContainerRef],
  );

  // 组件卸载时清理 observer
  useEffect(() => {
    return () => {
      if (roRef.current) {
        roRef.current.disconnect();
        roRef.current = null;
      }
    };
  }, []);

  const canvasStyle: React.CSSProperties = useMemo(
    () =>
      zoomEnabled
        ? { display: "block", width: styleWidth, height: styleHeight }
        : { display: "block" },
    [zoomEnabled, styleWidth, styleHeight],
  );

  const canvasEl = useMemo(
    () => (
      <div
        ref={mergedContainerRef}
        style={{
          position: "relative",
          overflow: "auto",
          width: "100%",
          height: "100%",
          flex: 1,
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <canvas ref={canvasCallbackRef} style={canvasStyle} />
        <input
          ref={inputRef}
          type="text"
          style={{
            opacity: 0,
            position: "absolute",
            left: 0,
            top: 0,
            width: 100,
            height: 20,
            border: "1px solid #000",
          }}
        />
      </div>
    ),
    [mergedContainerRef, canvasCallbackRef, canvasStyle],
  );

  // ── 默认物料面板组件 ──
  const MaterialPalette = useMemo(
    () => createDesignMaterialPalette(BUILTIN_COMPONENTS, dragProps),
    [dragProps],
  );

  return {
    Banvas: canvasEl,
    pages,
    currentPageId,
    selectedViewId,
    actions,
    contextMenu,
    materials: BUILTIN_COMPONENTS,
    MaterialPalette,
    builtinComponents: BUILTIN_COMPONENTS,
  };
}
