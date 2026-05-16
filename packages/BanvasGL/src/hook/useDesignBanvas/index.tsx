import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useCanvasInit } from '../useCanvasInit'
import type { SerializedPageJSON, UseCanvasOptions } from '../useCanvasInit'
import { useCanvasEvents } from "./canvas/useCanvasEvents";
import type { ContextMenuHitResult } from "./canvas/useCanvasEvents";
import { useInputEvents } from "./canvas/useInputEvents";
import { buildPageNodes } from "./data/builders";
import { createBanvasActions } from "./actions";
import { BUILTIN_COMPONENTS } from "./data/builtinComponents";
import {
  buildViewContextMenuItems,
  buildCanvasContextMenuItems,
} from "./data/contextMenu";
import type {
  IPageNode,
  IUseBanvasResult,
  IContextMenuState,
  IContextMenuItem,
} from "@/core/interfaces";

export default function useDesignBanvas(
  serializedPages: SerializedPageJSON[],
  _options: UseCanvasOptions,
): IUseBanvasResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Canvas 初始化
  const { app, canvasRef, canvasCallbackRef } = useCanvasInit(
    serializedPages,
    _options,
  );

  // 获取 App 引用的稳定闭包（供 actions 使用）
  const appRef = useRef(app);
  appRef.current = app;
  const getApp = useCallback(() => appRef.current, []);

  // ──── useSyncExternalStore：监听 app 状态变更 ────
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

  // version 变化 → React 重新渲染
  const _version = useSyncExternalStore(subscribe, getSnapshot);

  // 创建 actions（稳定引用，内部通过 getApp 获取最新 app）
  const actions = useMemo(() => createBanvasActions(getApp), [getApp]);

  // ──── 从引擎状态派生 selectedViewId / currentPageId ────
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

  // ───── 右键菜单状态 ─────
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
        // paste 操作使用画布坐标
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

  // 构建 pages 树（当 app 状态变更时自动更新）
  const pages: IPageNode[] = useMemo(() => {
    if (!app) return [];
    return buildPageNodes(app);
  }, [app, _version]);

  // Canvas 事件绑定（设计态）
  useCanvasEvents({
    app,
    canvasRef,
    inputRef,
    actions,
    onContextMenuHit,
    onInteractionEnd: () => app?.notify(),
  });

  // Input 事件绑定
  useInputEvents({
    app,
    inputRef,
  });

  const canvasEl = useMemo(
    () => (
      <div
        ref={containerRef}
        style={{
          position: "relative",
        }}
      >
        <canvas
          ref={canvasCallbackRef}
          style={{
            display: "block",
          }}
        />
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
    [],
  );

  return {
    Banvas: canvasEl,
    pages,
    currentPageId,
    selectedViewId,
    actions,
    contextMenu,
    // 稳定引用：模块级常量，不随渲染变化
    builtinComponents: BUILTIN_COMPONENTS,
  };
}
