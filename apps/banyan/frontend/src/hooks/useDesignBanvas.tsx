import React from "react";
import { useFixedCanvasInit } from "@banyuan/banvasgl-react";
import type { IBanvasActions, IAppOptions } from "@banyuan/banvasgl";
import type { WebCanvasOptions } from "@banyuan/banvasgl-react";
import { useInteraction } from "@/hooks/useInteraction";
import { useDesignContextMenu } from "./useDesignContextMenu";
import type { UseDesignContextMenuResult } from "./useDesignContextMenu";
import type { IContextMenuState } from "@/types/contextMenu";
import { useApplicationStore } from "@/stores/applicationStore";

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
  /** 保存为物料弹窗控制 */
  saveMaterial: UseDesignContextMenuResult['saveMaterial'];
}

export interface UseDesignBanvasOptions {
  appOptions?: Partial<IAppOptions>;
  rendererOptions?: WebCanvasOptions;
}

export default function useDesignBanvas(
  options: UseDesignBanvasOptions,
): IUseBanvasResult<React.ReactElement> {
  const { appOptions, rendererOptions } = options;

  // ── Store 桥接源 ──
  const designSize = useApplicationStore((s) => s.designSize);
  const uiJSON = useApplicationStore((s) => s.uiJSON);
  const { registerActions, setDesignSize } = useApplicationStore();

  // ── 初始化：固定模式画布 + textInput ──
  // flowEnabled: false — 编辑态禁止 FlowSchema 执行（显式传值，不依赖隐式约定）
  const appOptionsStable = React.useMemo(
    () => ({ flowEnabled: false, ...appOptions }),
    [appOptions],
  );
  const fallbackRendererOptions = React.useMemo(
    () => ({ clearColor: "#fff" }),
    [],
  );
  const { actions, elements, derived } = useFixedCanvasInit({
    appOptions: appOptionsStable,
    rendererOptions: rendererOptions ?? fallbackRendererOptions,
    textInput: true,
  });

  // ════════════════════════════════════════════════════════════════
  // Store ↔ 引擎 桥接
  // ════════════════════════════════════════════════════════════════

  // ① designSize: store → 引擎
  React.useEffect(() => {
    if (actions?.app) {
      actions.app.setDesignSize(designSize.width, designSize.height);
    }
  }, [actions, designSize.width, designSize.height]);

  // ② 挂载 actions 到 store + 同步设计尺寸: 引擎 → store
  React.useEffect(() => {
    if (!actions?.app) return;
    const unregister = registerActions(actions);
    const ds = actions.app.getDesignSize();
    setDesignSize({ width: ds.width, height: ds.height });
    return unregister;
  }, [registerActions, setDesignSize, actions]);

  // ③ 引擎变更 → 标记 UI 脏
  React.useEffect(() => {
    if (!actions?.app) return;
    return actions.app.subscribe(() => {
      useApplicationStore.getState().markUIDirty();
    });
  }, [actions]);

  // ④ uiJSON: store → 引擎
  React.useEffect(() => {
    if (actions?.app && uiJSON) {
      actions.app.loadAppJSON(uiJSON);
    }
  }, [uiJSON, actions]);

  // ── 右键菜单 ──
  const { contextMenu, onContextMenu, saveMaterial } = useDesignContextMenu(actions);

  useInteraction({
    canvas: derived.canvas,
    actions,
    mode: "design",
    inputElement: derived.inputElement,
    onContextMenu,
  });

  return {
    Banvas: elements.container,
    currentPageId: derived.currentPageId,
    selectedViewId: derived.selectedViewId,
    actions: actions!,
    contextMenu,
    saveMaterial,
  };
}
