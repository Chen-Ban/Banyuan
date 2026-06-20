import React from "react";
import { useFixedCanvasInit } from "@banyuan/banvasgl-react";
import type { IBanvasActions } from "@banyuan/banvasgl";
import { useInteraction } from "@/hooks/useInteraction";
import { useDesignContextMenu } from "./useDesignContextMenu";
import type { IContextMenuState } from "@/types/contextMenu";

/**
 * useDesignBanvas Hook 的返回值类型
 *
 * 特征：
 * - 不暴露 App / Scene 实例
 * - 通过 derived 提供只读的页面 + 选中态数据
 * - 通过 actions 提供所有可用操作
 * - Banvas 仍然是 React 元素，业务方直接渲染
 */
export interface IUseBanvasResult<TElement = unknown> {
  /** Canvas 渲染元素（React.ReactElement 或其他 UI 框架元素） */
  Banvas: TElement;
  /** 当前活跃页面 ID */
  currentPageId: string | null;
  /** 当前选中视图 ID（空字符串表示未选中） */
  selectedViewId: string;
  /** 命名空间化的操作接口 */
  actions: IBanvasActions;
  /** 右键菜单上下文 */
  contextMenu: IContextMenuState;
}

export interface UseDesignBanvasOptions {
  /** 页面样式宽度（设计尺寸，CSS 像素） */
  width: number;
  /** 页面样式高度（设计尺寸，CSS 像素） */
  height: number;
  /** 序列化的应用 JSON（空字符串表示新建空白应用） */
  appJSON: string;
  appOptions?: Partial<import("@banyuan/banvasgl").IAppOptions>;
  rendererOptions?: Omit<import("@banyuan/banvasgl").IRendererOptions, "dpr">;
}

export default function useDesignBanvas(
  options: UseDesignBanvasOptions,
): IUseBanvasResult<React.ReactElement> {
  const { width, height, appJSON, appOptions, rendererOptions } = options;

  // ── 初始化：固定模式画布 + textInput ──
  // flowEnabled: false — 编辑态禁止 FlowSchema 执行（显式传值，不依赖隐式约定）
  const { actions, elements, derived } = useFixedCanvasInit({
    width,
    height,
    appJSON,
    appOptions: { flowEnabled: false, ...appOptions },
    rendererOptions: rendererOptions ?? { clearColor: "#fff" },
    textInput: true,
  });

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
