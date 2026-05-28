import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useCanvasInit } from "../shared/useCanvasInit";
import { useCanvasZoom } from "../shared/useCanvasZoom";
import type { UseCanvasOptions } from "../shared/useCanvasInit";
import { useCanvasEvents } from "./useCanvasEvents";
import type { ContextMenuHitResult } from "./useCanvasEvents";
import { useInputEvents } from "./useInputEvents";
import {
  createBanvasActions,
  DESIGN_MATERIALS,
  createViewContextMenuItems,
  createCanvasContextMenuItems,
} from "@banyuan/banvasgl";
import type {
  IUseBanvasResult,
  IContextMenuState,
  IContextMenuItem,
  IComponentDefinition,
  IDragProps,
} from "@banyuan/banvasgl";
import { createDesignMaterialPalette } from "../../components/DesignEditor/DesignMaterialPalette";

/** SerializedPageJSON 内联类型（原来来自 banvas-runtime-web） */
export type SerializedPageJSON = string;

export type { UseCanvasOptions };

export default function useDesignBanvas(
  serializedPages: SerializedPageJSON[],
  _options: UseCanvasOptions,
): IUseBanvasResult<React.ReactElement> {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // ── 容器尺寸自测量 ──
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // ── Canvas 缩放（Cmd/Ctrl + Wheel） ──
  const zoomEnabled = containerSize.width > 0 && containerSize.height > 0;
  const { scale: _scale, styleWidth, styleHeight, zoomContainerRef } = useCanvasZoom({
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
        items = createViewContextMenuItems(hit.view, scene, actions);
      } else {
        items = createCanvasContextMenuItems(actions, hit.canvasPosition);
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
      if (roRef.current) {
        roRef.current.disconnect();
        roRef.current = null;
      }

      containerRef.current = node;
      zoomContainerRef(node);

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
    },
    [zoomContainerRef],
  );

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
    () => createDesignMaterialPalette(DESIGN_MATERIALS, dragProps),
    [dragProps],
  );

  return {
    Banvas: canvasEl,
    currentPageId,
    selectedViewId,
    actions,
    contextMenu,
    materials: DESIGN_MATERIALS,
    MaterialPalette,
  };
}
