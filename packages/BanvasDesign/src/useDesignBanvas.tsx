import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { useCanvasInit } from '@banyuan/canvas-runtime'
import type { SerializedPageJSON, UseCanvasOptions } from '@banyuan/canvas-runtime'
import { useCanvasEvents } from './canvas/useCanvasEvents.js'
import type { ContextMenuHitResult } from './canvas/useCanvasEvents.js'
import { useInputEvents } from './canvas/useInputEvents.js'
import { buildPageNodes } from './data/builders.js'
import { createBanvasActions } from './actions/index.js'
import { BUILTIN_COMPONENTS } from './data/builtinComponents.js'
import {
  buildViewContextMenuItems,
  buildCanvasContextMenuItems,
} from './data/contextMenu.js'
import type {
  IPageNode,
  IUseBanvasResult,
  IContextMenuState,
  IContextMenuItem,
} from '@banyuan/canvas'

export type { SerializedPageJSON, UseCanvasOptions }

export default function useDesignBanvas(
  serializedPages: SerializedPageJSON[],
  _options: UseCanvasOptions,
): IUseBanvasResult<React.ReactElement> {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

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
    if (!app) return '';
    const scene = app.getCurrentScene();
    if (!scene) return '';
    const selected = scene.getSelectedView();
    return selected?.id ?? '';
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
      target: 'canvas',
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

      if (hit.target === 'view' && hit.view) {
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
    inputRef,
  });

  const canvasEl = useMemo(
    () => (
      <div
        ref={containerRef}
        style={{ position: 'relative' }}
      >
        <canvas
          ref={canvasCallbackRef}
          style={{ display: 'block' }}
        />
        <input
          ref={inputRef}
          type="text"
          style={{
            opacity: 0,
            position: 'absolute',
            left: 0,
            top: 0,
            width: 100,
            height: 20,
            border: '1px solid #000',
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
    builtinComponents: BUILTIN_COMPONENTS,
  };
}
