// 导出所有addon类型和实现
export type { ViewportAddon } from './ViewportAddon'
export { default as ViewportAddonImpl } from './ViewportAddon'
export type { BoundingBoxAddon } from './BoundingBoxAddon'
export { default as BoundingBoxAddonImpl } from './BoundingBoxAddon'
export type { VertexAddon } from './VertexAddon'
export { default as VertexAddonImpl } from './VertexAddon'

// 导出交互结果构建器
export { InteractionResultBuilder, type InteractionResult } from './InteractionResultBuilder'

// 导出类型联合
import type { ViewportAddon } from './ViewportAddon'
import type { BoundingBoxAddon } from './BoundingBoxAddon'
import type { VertexAddon } from './VertexAddon'
import ViewportAddonImpl from './ViewportAddon'
import BoundingBoxAddonImpl from './BoundingBoxAddon'
import VertexAddonImpl from './VertexAddon'

export type ViewAddon = ViewportAddon | BoundingBoxAddon | VertexAddon
export type ViewAddonImpl = ViewportAddonImpl | BoundingBoxAddonImpl | VertexAddonImpl
