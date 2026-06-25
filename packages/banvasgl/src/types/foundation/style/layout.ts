/**
 * 容器布局模式与配置
 *
 * - 'free'：自由定位，子元素 matrix 由用户拖拽控制（默认）
 * - 'flex'：弹性布局，子元素位置由 FlexLayoutStrategy 计算
 * - 'list'：线性列表布局，简化版 flex（无权重/对齐，只有方向+间距）
 * - 'grid'：网格布局，按行列数 + gap 排列子元素
 * - 'scroll'：语法糖，等价于 free + overflow:'scroll'（自动撑开内容区）
 */
export type LayoutMode = 'free' | 'flex' | 'list' | 'grid' | 'scroll'

/** Flex 布局配置（layoutMode='flex' 时生效） */
export interface IFlexLayout {
  // ── 容器级属性（决定子元素如何排列） ──
  /** 主轴方向 */
  direction: 'row' | 'column'
  /** 子元素间距 */
  gap: number
  /** 主轴对齐方式 */
  mainAxisAlignment: 'start' | 'center' | 'end' | 'spaceBetween' | 'spaceAround'
  /** 交叉轴对齐方式 */
  crossAxisAlignment: 'start' | 'center' | 'end' | 'stretch'
  /** 内边距（布局区域缩进） */
  padding: number | [number, number, number, number]
  /** 是否开启流式换行（默认 false） */
  wrap?: boolean
  /** 换行后行间距（wrap=true 时生效），默认与 gap 一致 */
  lineGap?: number

  // ── 子元素级属性（当前视图作为 flex 子元素时生效） ──
  /** flex 权重（0 或缺省 = 固定尺寸，> 0 = 弹性分配剩余空间） */
  flex?: number
  /** 覆盖父容器的 crossAxisAlignment（仅对当前子元素生效） */
  alignSelf?: 'start' | 'center' | 'end' | 'stretch'
}

/** List 布局配置（layoutMode='list' 时生效） */
export interface IListLayout {
  /** 排列方向 */
  direction: 'row' | 'column'
  /** 子元素间距 */
  gap: number
  /** 内边距 */
  padding: number | [number, number, number, number]
}

/** Grid 布局配置（layoutMode='grid' 时生效） */
export interface IGridLayout {
  /** 列数 */
  columns: number
  /** 行间距 */
  rowGap: number
  /** 列间距 */
  columnGap: number
  /** 内边距 */
  padding: number | [number, number, number, number]
}

/** 滚动布局配置（overflow='scroll' 时生效） */
export interface IScrollLayout {
  /** 水平滚动偏移（px），默认 0 */
  scrollX?: number
  /** 垂直滚动偏移（px），默认 0 */
  scrollY?: number
}
