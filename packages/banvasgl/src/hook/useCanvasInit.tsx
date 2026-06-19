/**
 * useCanvasInit — 底层 Canvas 初始化 hook（已弃用）
 *
 * @deprecated 请使用 useFixedCanvasInit（固定模式）或 useAdaptiveCanvasInit（自适应模式）。
 *   本模块作为兼容层保留，直接转发到 useFixedCanvasInit（覆盖绝大多数场景）。
 *   自适应模式使用者请直接 import { useAdaptiveCanvasInit }。
 *
 * 迁移指引：
 *   - 固定模式（传了 width + height）→ useFixedCanvasInit({ width, height, appJSON, ... })
 *   - 自适应模式（不传 width/height）→ useAdaptiveCanvasInit({ appJSON, ... })
 */

// 重新导出新 hook 作为兼容别名
export { useFixedCanvasInit as useCanvasInit } from './useFixedCanvasInit.js'

// 类型兼容：SelectedViewPos 已从 useFixedCanvasInit 导出
export type { SelectedViewPos } from './useFixedCanvasInit.js'

// 保留旧类型名称以保持向后兼容
import type { IAppOptions } from "@/types/engine/app.js";
import type { IRendererOptions } from "@/types/engine/renderer.js";
import type { IBanvasActions } from "@/types/hook/hook.js";

/**
 * @deprecated 请使用 UseFixedCanvasOptions 或 UseAdaptiveCanvasOptions
 */
export interface UseCanvasOptions {
  width?: number;
  height?: number;
  appOptions?: Partial<IAppOptions>;
  rendererOptions?: Omit<IRendererOptions, "dpr">;
  textInput?: boolean;
}

/**
 * @deprecated 请使用 UseFixedCanvasResult 或 UseAdaptiveCanvasResult
 */
export interface UseCanvasInitResult {
  actions: IBanvasActions | null;
  elements: {
    container: React.ReactElement;
  };
  derived: {
    revision: number;
    selectedViewId: string;
    currentPageId: string | null;
    selectedViewPos: import("./useFixedCanvasInit.js").SelectedViewPos | null;
    canvas: HTMLCanvasElement | null;
    inputElement: HTMLInputElement | null;
  };
}
