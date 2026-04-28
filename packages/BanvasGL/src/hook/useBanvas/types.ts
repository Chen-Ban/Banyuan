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
}
