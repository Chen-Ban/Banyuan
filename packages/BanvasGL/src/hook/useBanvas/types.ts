import type { AppOptions } from "@/core/app";
import type { RendererOptions } from "@/core/renderer/Renderer";
import type { App } from "@/core/app";

export interface UseBanvasOptions {
  width?: number;
  height?: number;
  appOptions?: AppOptions;
  rendererOptions?: RendererOptions;
}

export type SerializedSceneJSON = string;

export interface UseBanvasResult {
  Banvas: React.ReactElement;
  app: App | null;
}
