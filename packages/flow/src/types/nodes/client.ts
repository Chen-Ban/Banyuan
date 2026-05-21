/**
 * 前端专属节点 —— 仅在浏览器环境执行
 */

import type { FlowValue } from '../values.js'

/** 设置 View 的 data 字段 */
export interface FlowSetDataNode {
  kind: 'setData'
  viewId: string // 'self' 表示触发事件的 View
  key: string
  value: FlowValue
}

/** 页面导航 */
export interface FlowNavigateNode {
  kind: 'navigate'
  pageId: string
}

/** 播放动画 */
export interface FlowAnimateNode {
  kind: 'animate'
  viewId: string
  animationId: string
}

/** 设置 View 可见性 */
export interface FlowSetVisibleNode {
  kind: 'setVisible'
  viewId: string
  visible: boolean
}

/** 前端节点联合 */
export type ClientFlowNode =
  | FlowSetDataNode
  | FlowNavigateNode
  | FlowAnimateNode
  | FlowSetVisibleNode
