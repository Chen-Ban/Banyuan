import type { IAppOptions } from "@/core/interfaces";
import type { IRendererOptions } from "@/core/interfaces/IRenderer";

export interface UseBanvasOptions {
  width: number;
  height: number;
  appOptions?: IAppOptions;
  rendererOptions?: Omit<IRendererOptions, 'dpr'>;
}

export type SerializedSceneJSON = string;
