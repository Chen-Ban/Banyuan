import type { IAppOptions, IRendererOptions } from "@/core/interfaces";

export interface UseBanvasOptions {
  width: number;
  height: number;
  appOptions?: IAppOptions;
  rendererOptions?: Omit<IRendererOptions, 'dpr'>;
}

export type SerializedSceneJSON = string;
