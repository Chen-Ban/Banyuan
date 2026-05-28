/**
 * 设计态物料目录
 *
 * 定义可拖拽到画布上的组件物料列表，每个物料包含模板信息和面板展示信息。
 * 业务层可过滤/扩展此列表来定制自己的物料面板。
 */

import { ViewType, GraphType } from '@/foundation/constants'
import type { IComponentDefinition } from '@/types/hook/hook'

export const DESIGN_MATERIALS: IComponentDefinition[] = [
  {
    id: 'builtin.line',
    label: '直线',
    description: '直线',
    source: 'builtin',
    icon: {
      type: 'svg',
      content: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <line x1="4" y1="20" x2="20" y2="4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>`,
    },
    template: {
      viewType: ViewType.GRAPHVIEW,
      graphType: GraphType.LINE,
      defaultProps: {},
    },
  },
  {
    id: 'builtin.circle',
    label: '圆形',
    description: '圆形',
    source: 'builtin',
    icon: {
      type: 'svg',
      content: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/>
</svg>`,
    },
    template: {
      viewType: ViewType.GRAPHVIEW,
      graphType: GraphType.CIRCLE,
      defaultProps: { radius: 50 },
    },
  },
  {
    id: 'builtin.rounded-rect',
    label: '圆角矩形',
    description: '矩形',
    source: 'builtin',
    icon: {
      type: 'svg',
      content: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="3" y="5" width="18" height="14" rx="4" ry="4" stroke="currentColor" stroke-width="2"/>
</svg>`,
    },
    template: {
      viewType: ViewType.GRAPHVIEW,
      graphType: GraphType.ROUNDED_RECT,
      defaultProps: { width: 100, height: 100, radii: 12 },
    },
  },
  {
    id: 'builtin.text',
    label: '文本',
    description: '文本',
    source: 'builtin',
    icon: {
      type: 'svg',
      content: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <text x="12" y="17" text-anchor="middle" font-size="14" fill="currentColor" font-weight="bold" font-family="sans-serif">T</text>
</svg>`,
    },
    template: {
      viewType: ViewType.TEXTVIEW,
      defaultProps: { text: '文本' },
    },
  },
  {
    id: 'builtin.image',
    label: '图片',
    description: '图片',
    source: 'builtin',
    icon: {
      type: 'svg',
      content: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="3" y="5" width="18" height="14" rx="1" stroke="currentColor" stroke-width="2"/>
  <circle cx="8" cy="10" r="2" fill="currentColor"/>
  <polyline points="3,16 9,12 14,15 18,11 21,14" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/>
</svg>`,
    },
    template: {
      viewType: ViewType.IMAGEVIEW,
      defaultProps: {
        imageSrc: 'https://picsum.photos/200/300',
        width: 200,
        height: 300,
      },
    },
  },
  {
    id: 'builtin.cubic-bezier',
    label: '三次贝塞尔',
    description: '三次贝塞尔曲线（4 个控制点，S 形）',
    source: 'builtin',
    icon: {
      type: 'svg',
      content: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M3 18 C7 4, 11 4, 12 12 S17 20, 21 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
</svg>`,
    },
    template: {
      viewType: ViewType.GRAPHVIEW,
      graphType: GraphType.CUBIC_BEZIER,
      defaultProps: { length: 120 },
    },
  },
  {
    id: 'builtin.quadratic-bezier',
    label: '二次贝塞尔',
    description: '二次贝塞尔曲线（3 个控制点，弧形）',
    source: 'builtin',
    icon: {
      type: 'svg',
      content: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M3 18 Q12 2, 21 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
</svg>`,
    },
    template: {
      viewType: ViewType.GRAPHVIEW,
      graphType: GraphType.QUADRATIC_BEZIER,
      defaultProps: { length: 120 },
    },
  },
  {
    id: 'builtin.triangle',
    label: '三角形',
    description: '等边三角形',
    source: 'builtin',
    icon: {
      type: 'svg',
      content: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <polygon points="12,4 21,20 3,20" stroke="currentColor" stroke-width="2" stroke-linejoin="round" fill="none"/>
</svg>`,
    },
    template: {
      viewType: ViewType.GRAPHVIEW,
      graphType: GraphType.TRIANGLE,
      defaultProps: { size: 100 },
    },
  },
  {
    id: 'builtin.regular-polygon',
    label: '正多边形',
    description: '正六边形（可调边数）',
    source: 'builtin',
    icon: {
      type: 'svg',
      content: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <polygon points="12,3 20.5,7.5 20.5,16.5 12,21 3.5,16.5 3.5,7.5" stroke="currentColor" stroke-width="2" stroke-linejoin="round" fill="none"/>
</svg>`,
    },
    template: {
      viewType: ViewType.GRAPHVIEW,
      graphType: GraphType.REGULAR_POLYGON,
      defaultProps: { radius: 50, sides: 6 },
    },
  },
  {
    id: 'builtin.arc',
    label: '弧线',
    description: '椭圆弧线',
    source: 'builtin',
    icon: {
      type: 'svg',
      content: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M4 18 A10 10 0 0 1 20 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
</svg>`,
    },
    template: {
      viewType: ViewType.GRAPHVIEW,
      graphType: GraphType.ARC,
      defaultProps: { radius: 50 },
    },
  },
  {
    id: 'builtin.flex',
    label: '弹性容器',
    description: '弹性布局容器，子元素自动排列',
    source: 'builtin',
    icon: {
      type: 'svg',
      content: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" stroke-width="2" fill="none"/>
  <line x1="9" y1="4" x2="9" y2="20" stroke="currentColor" stroke-width="1.5"/>
  <line x1="16" y1="4" x2="16" y2="20" stroke="currentColor" stroke-width="1.5"/>
</svg>`,
    },
    template: {
      viewType: ViewType.FLEXVIEW,
      defaultProps: { width: 300, height: 100 },
    },
  },
  {
    id: 'builtin.input',
    label: '输入框',
    description: '可编辑输入框',
    source: 'builtin',
    icon: {
      type: 'svg',
      content: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="7" width="20" height="10" rx="2" stroke="currentColor" stroke-width="2" fill="none"/>
  <line x1="6" y1="12" x2="6" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <line x1="7" y1="9.5" x2="7" y2="14.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`,
    },
    template: {
      viewType: ViewType.INPUT,
      defaultProps: { text: '' },
    },
  },
  {
    id: 'builtin.video',
    label: '视频',
    description: '视频播放组件',
    source: 'builtin',
    icon: {
      type: 'svg',
      content: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="5" width="15" height="14" rx="2" stroke="currentColor" stroke-width="2" fill="none"/>
  <polyline points="17,9 22,6 22,18 17,15" stroke="currentColor" stroke-width="2" stroke-linejoin="round" fill="none"/>
</svg>`,
    },
    template: {
      viewType: ViewType.VIDEOVIEW,
      defaultProps: { videoSrc: '', width: 320, height: 180 },
    },
  },
]
