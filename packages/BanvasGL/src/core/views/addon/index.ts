export type { BoundingBoxAddon } from "./BoundingBoxAddon";
export { default as BoundingBoxAddonImpl } from "./BoundingBoxAddon";
export type { VertexAddon } from "./VertexAddon";
export { default as VertexAddonImpl } from "./VertexAddon";

// 导出交互结果构建器
export {
  InteractionMapBuilder,
  type InteractionMap,
} from "../View/InteractionMapBuilder";

// 导出类型联合
import type { BoundingBoxAddon } from "./BoundingBoxAddon";
import type { VertexAddon } from "./VertexAddon";
import BoundingBoxAddonImpl from "./BoundingBoxAddon";
import VertexAddonImpl from "./VertexAddon";

export type ViewAddon = BoundingBoxAddon | VertexAddon;
export type ViewAddonImpl =
  BoundingBoxAddonImpl
  | VertexAddonImpl;
