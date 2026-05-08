/**
 * 引擎内置物料列表
 *
 * 每个物料包含：
 *   - 展示信息（id / label / description / icon）
 *   - 创建数据（template → 传给 actions.view.create）
 *
 * 图标使用内联 SVG 字符串，框架无关，前端通过 dangerouslySetInnerHTML 渲染。
 * 业务层可通过 iconOverrides 按 id 覆盖图标，不覆盖则使用此处默认值。
 */

import { VIEWTYPE, GRAPHTYPE } from "@/core/constants";
import type { IComponentDefinition } from "@/core/interfaces";

export const BUILTIN_COMPONENTS: IComponentDefinition[] = [
  {
    id: "builtin.line",
    label: "直线",
    description: "直线",
    source: "builtin",
    icon: {
      type: "svg",
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
    id: "builtin.circle",
    label: "圆形",
    description: "圆形",
    source: "builtin",
    icon: {
      type: "svg",
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
    id: "builtin.rounded-rect",
    label: "圆角矩形",
    description: "矩形",
    source: "builtin",
    icon: {
      type: "svg",
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
    id: "builtin.text",
    label: "文本",
    description: "文本",
    source: "builtin",
    icon: {
      type: "svg",
      content: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <text x="12" y="17" text-anchor="middle" font-size="14" fill="currentColor" font-weight="bold" font-family="sans-serif">T</text>
</svg>`,
    },
    template: {
      viewType: VIEWTYPE.TEXTVIEW,
      defaultProps: { text: "文本" },
    },
  },
  {
    id: "builtin.image",
    label: "图片",
    description: "图片",
    source: "builtin",
    icon: {
      type: "svg",
      content: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="3" y="5" width="18" height="14" rx="1" stroke="currentColor" stroke-width="2"/>
  <circle cx="8" cy="10" r="2" fill="currentColor"/>
  <polyline points="3,16 9,12 14,15 18,11 21,14" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/>
</svg>`,
    },
    template: {
      viewType: VIEWTYPE.IMAGEVIEW,
      defaultProps: {
        imageSrc: "https://picsum.photos/200/300",
        width: 200,
        height: 300,
      },
    },
  },
];
