import React from "react";
import { useCanvasInit } from "@banyuan/banvasgl/react";
import type { UseCanvasOptions } from "@banyuan/banvasgl/react";
import { useInteraction } from "@/hooks/useInteraction";
import { useDesignContextMenu } from "./useDesignContextMenu";
import type { IUseBanvasResult } from "@/types";

export type { UseCanvasOptions };

export default function useDesignBanvas(
  appJSON: string,
  _options: UseCanvasOptions,
): IUseBanvasResult<React.ReactElement> {
  // ── 初始化：App + 容器 DOM + 相机交互 + version 订阅 + textInput ──
  const { actions, elements, derived } =
    useCanvasInit(appJSON, { ..._options, textInput: true });

  // ── 右键菜单 ──
  const { contextMenu, onContextMenuHit } = useDesignContextMenu(actions);

  useInteraction({
    canvas: derived.canvas,
    actions,
    mode: "design",
    inputElement: derived.inputElement,
    onContextMenuHit,
  });

  return {
    Banvas: elements.container,
    currentPageId: derived.currentPageId,
    selectedViewId: derived.selectedViewId,
    actions: actions!,
    contextMenu,
  };
}
