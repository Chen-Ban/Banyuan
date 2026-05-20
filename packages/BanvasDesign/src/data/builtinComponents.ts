/**
 * 引擎内置物料列表
 */

import { VIEWTYPE, GRAPHTYPE } from '@banyuan/canvas'
import type { IComponentDefinition } from '@banyuan/canvas'

export const BUILTIN_COMPONENTS: IComponentDefinition[] = [
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
      viewType: VIEWTYPE.GRAPHVIEW,
      graphType: GRAPHTYPE.LINE,
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
      viewType: VIEWTYPE.GRAPHVIEW,
      graphType: GRAPHTYPE.CIRCLE,
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
      viewType: VIEWTYPE.GRAPHVIEW,
      graphType: GRAPHTYPE.ROUNDED_RECT,
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
      viewType: VIEWTYPE.TEXTVIEW,
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
      viewType: VIEWTYPE.IMAGEVIEW,
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
      viewType: VIEWTYPE.GRAPHVIEW,
      graphType: GRAPHTYPE.CUBIC_BEZIER,
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
      viewType: VIEWTYPE.GRAPHVIEW,
      graphType: GRAPHTYPE.QUADRATIC_BEZIER,
      defaultProps: { length: 120 },
    },
  },
]
