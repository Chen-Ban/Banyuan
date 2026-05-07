import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useCanvasInit } from "./useCanvasInit";
import { useCanvasEvents } from "./useCanvasEvents";
import type { ContextMenuHitResult } from "./useCanvasEvents";
import { useInputEvents } from "./useInputEvents";
import { SerializedSceneJSON, UseBanvasOptions } from "./types";
import { buildPageNodes } from "./builders";
import { createBanvasActions } from "./actions";
import {
  buildViewContextMenuItems,
  buildCanvasContextMenuItems,
} from "./contextMenu";
import type {
  IPageNode,
  IUseBanvasResult,
  IContextMenuState,
  IContextMenuItem,
} from "@/core/interfaces";

export default function useBanvas(
  serializedScenes: SerializedSceneJSON[],
  _options: UseBanvasOptions,
): IUseBanvasResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [selectedViewId, setSelectedViewId] = useState<string>("");
  const [currentPageId, setCurrentPageId] = useState<string | null>(null);
  const [pages, setPages] = useState<IPageNode[]>([]);

  // 刷新计数器，用于触发 pages 重建
  const [, setTick] = useState(0);
  const forceUpdate = useCallback(() => setTick((t) => t + 1), []);

  // Canvas 初始化
  const { app, canvasRef, canvasCallbackRef } = useCanvasInit(serializedScenes, _options);

  // 获取 App 引用的稳定闭包（供 actions 使用）
  const appRef = useRef(app);
  appRef.current = app;
  const getApp = useCallback(() => appRef.current, []);

  // 视图/页面变更回调
  const onViewChange = useCallback(() => {
    forceUpdate();
  }, [forceUpdate]);

  const onPageChange = useCallback(() => {
    forceUpdate();
    // 更新 currentPageId
    const currentScene = appRef.current?.getCurrentScene();
    if (currentScene) {
      setCurrentPageId(currentScene.id);
    }
  }, [forceUpdate]);

  // 创建 actions（稳定引用，内部通过 getApp 获取最新 app）
  const actions = useMemo(
    () => createBanvasActions(getApp, onViewChange, onPageChange),
    [getApp, onViewChange, onPageChange],
  );

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

  // 初始化 currentPageId
  useEffect(() => {
    const scene = app?.getCurrentScene();
    if (scene) {
      setCurrentPageId(scene.id);
    }
  }, [app]);

  // 重建 pages 树（当 app/tick 变化时）
  useEffect(() => {
    if (!app) {
      setPages([]);
      return;
    }
    const pageNodes = buildPageNodes(app);
    setPages(pageNodes);
  }, [app, currentPageId, selectedViewId, /* tick trigger */ forceUpdate]);

  // Canvas 事件绑定
  useCanvasEvents({
    app,
    canvasRef,
    inputRef,
    setSelectedViewId,
    actions,
    onContextMenuHit,
    onInteractionEnd: onViewChange,
  });

  // Input 事件绑定
  useInputEvents({
    app,
    inputRef,
    setSelectedViewId,
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
  };
}
