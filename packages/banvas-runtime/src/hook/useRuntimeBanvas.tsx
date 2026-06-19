/**
 * useRuntimeBanvas — 运行态画布组装 hook
 *
 * 复用 banvasgl 的 useFixedCanvasInit 机制底座，注入运行策略：
 *   - flowEnabled: true（运行态允许 FlowSchema 执行）
 *   - textInput: false（运行态无文本编辑需求）
 *   - 装配 useRuntimeInteraction（高级交互识别 + 事件派发）
 *   - 自动创建 WebEventAdapter（平台适配层）
 *
 * 与 useDesignBanvas 完全对称：同一机制底座，各自注入对应策略。
 */

import type React from "react";
import { useMemo } from "react";
import { useFixedCanvasInit } from "@banyuan/banvasgl/react";
import type { UseFixedCanvasOptions } from "@banyuan/banvasgl/react";
import type { IBanvasActions } from "@banyuan/banvasgl";
import { useRuntimeInteraction } from "./useRuntimeInteraction.js";
import { WebEventAdapter } from "../adapters/web.js";

export interface UseRuntimeOptions extends UseFixedCanvasOptions {
  /** 应用 ID，运行态后端节点请求使用 */
  appId?: string;
}

export interface UseRuntimeBanvasResult {
  /** 画布容器元素，放入 JSX 渲染 */
  Banvas: React.ReactElement;
  /** 操作接口 */
  actions: IBanvasActions | null;
  /** 当前页面 ID */
  currentPageId: string | null;
}

export function useRuntimeBanvas(
  options: UseRuntimeOptions,
): UseRuntimeBanvasResult {
  const { appId, ...canvasOptions } = options;

  // 1. 复用 banvasgl 固定模式机制底座
  const { actions, elements, derived } = useFixedCanvasInit({
    ...canvasOptions,
    appOptions: { ...(canvasOptions.appOptions ?? {}), flowEnabled: true },
    textInput: false,
  });

  // 2. 创建 Web 平台适配器（canvas 可用时）
  const adapter = useMemo(() => {
    const canvas = derived.canvas;
    if (!canvas || !actions) return null;

    return new WebEventAdapter({
      element: canvas,
      coordinateTransform: (clientX: number, clientY: number) => {
        const fakeEvent = { clientX, clientY } as MouseEvent;
        return actions.view.screenToWorld(fakeEvent);
      },
    });
  }, [derived.canvas, actions]);

  // 3. 装配运行策略：适配器 + 高级交互识别 + 事件派发
  useRuntimeInteraction({
    adapter,
    actions,
  });

  return {
    Banvas: elements.container,
    actions,
    currentPageId: derived.currentPageId,
  };
}
