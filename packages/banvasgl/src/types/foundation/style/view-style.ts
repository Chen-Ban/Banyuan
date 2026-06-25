/**
 * IViewStyle —— 原始样式声明（用户传入）
 *
 * 四域合一的完备集合，用户通过 View.style 字段声明。
 */

import type { TransformOrigin } from './transform-origin'
import type { IFillStyleOptions, IStrokeStyleOptions, IShadowStyleOptions } from './paint-options'
import type { LayoutMode, IFlexLayout, IListLayout, IGridLayout, IScrollLayout } from './layout'

/** 视图样式 —— 四域合一的完备集合（用户传入的原始值） */
export interface IViewStyle {
  // ── 域一：布局域 ──────────────────────────────────────────────────────
  width?: number
  height?: number
  overflow?: 'visible' | 'hidden' | 'scroll'
  /** overflow=scroll 时的滚动布局配置 */
  scrollLayout?: IScrollLayout
  /** 变换原点，默认为 'center'（视口中心） */
  transformOrigin?: TransformOrigin
  needStructViewport?: boolean

  // ── 域一扩展：容器布局模式 ──────────────────────────────────────────
  /**
   * 容器布局模式。
   * - 'free'：自由定位，子元素 matrix 由用户拖拽控制（默认）
   * - 'flex'：弹性布局，子元素位置由 FlexLayoutStrategy 计算
   * - 'list'：线性列表布局（简化 flex，无权重/对齐）
   * - 'grid'：网格布局，按行列数排列
   * - 'scroll'：语法糖，等价于 free + overflow:'scroll'
   *
   * 仅对 CombinedView（容器视图）有效，叶子视图忽略此字段。
   */
  layoutMode?: LayoutMode
  /**
   * Flex 布局配置（layoutMode='flex' 时生效）。
   * 其他 layoutMode 时此字段被忽略。
   */
  flexLayout?: IFlexLayout
  /**
   * List 布局配置（layoutMode='list' 时生效）。
   */
  listLayout?: IListLayout
  /**
   * Grid 布局配置（layoutMode='grid' 时生效）。
   */
  gridLayout?: IGridLayout

  // ── 域二：容器装饰域（作用于容器盒，由 BoxDecorationAddon 渲染） ────
  /** 容器背景色（CSS 色值），默认 'transparent' */
  backgroundColor?: string
  borderWidth?: number
  borderColor?: string
  borderRadius?: number | [number, number, number, number]
  /** 是否裁剪超出内容，默认 false */
  clipContent?: boolean
  /** 整个 View 的透明度（影响容器+内容），默认 1 */
  opacity?: number

  // ── 域三：图形绘制域（作用于 Graph content，由 Graph.render 消费） ──
  /**
   * Graph 填充样式。
   * 未设置时 Graph 使用自身内置默认样式工厂。
   * fill 永远作用于 Graph，backgroundColor 永远作用于容器盒，两者可同时设置。
   */
  fill?: IFillStyleOptions
  /**
   * Graph 描边样式。
   * 未设置时 Graph 使用自身内置默认样式工厂。
   */
  stroke?: IStrokeStyleOptions
  /**
   * Graph 阴影样式。
   * 未设置时 Graph 使用自身内置默认样式工厂（默认无阴影）。
   */
  shadow?: IShadowStyleOptions
}
