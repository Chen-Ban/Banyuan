/**
 * View 样式体系 barrel
 *
 * 集中 re-export 样式体系所有公共类型。
 * 原先定义在 types/foundation/style.ts，现按领域拆分为独立文件。
 *
 * 消费方无需改动 —— `import {...} from '../foundation/style'` 自动解析到本文件。
 */

export type { TransformOriginKeyword, TransformOrigin } from './transform-origin'
export type { IFillStyleOptions, IStrokeStyleOptions, IShadowStyleOptions } from './paint-options'
export type { LayoutMode, IFlexLayout, IListLayout, IGridLayout, IScrollLayout } from './layout'
export type { IViewStyle } from './view-style'
export type { IComputedStyle } from './computed-style'
export type { FillType, StrokeType, GradientStop, PatternSize, VideoRepeat, VideoSize } from './base-types'
