import type { IAppOptions, IRendererOptions } from "@/core/interfaces";
import type { App } from "@/core/app";
import { Scene } from "@/core";

export interface UseBanvasOptions {
  width: number;
  height: number;
  appOptions?: IAppOptions;
  rendererOptions?: Omit<IRendererOptions, 'dpr'>;
}

export type SerializedSceneJSON = string;

export interface UseBanvasResult {
  Banvas: React.ReactElement;
  app: App | null;
  selectedScene: Scene | null,
  selectedViewId: string,
  setSelectedScene: (scene: Scene) => void
  setSelectedViewId: (id: string) => void
  /** 撤销上一步操作 */
  undo: () => boolean
  /** 重做上一步被撤销的操作 */
  redo: () => boolean
  /** 是否可以撤销 */
  canUndo: boolean
  /** 是否可以重做 */
  canRedo: boolean
}
