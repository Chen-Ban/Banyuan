import type { AppOptions } from "@/core/app";
import type { RendererOptions } from "@/core/renderer/Renderer";
import type { App } from "@/core/app";
import { Scene } from "@/core";

export interface UseBanvasOptions {
  width: number;
  height: number;
  appOptions?: AppOptions;
  rendererOptions?: Omit<RendererOptions, 'dpr'>;
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
